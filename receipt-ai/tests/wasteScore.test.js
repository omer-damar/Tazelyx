// wasteScore.js is pure arithmetic wrapped in two Mongoose reads. We stub only
// the query builders, so the scoring model itself -- the part being defended in
// the thesis -- is exercised for real.
jest.mock("../models/ConsumptionLog", () => ({ find: jest.fn() }));
jest.mock("../models/User", () => ({ findById: jest.fn() }));

const ConsumptionLog = require("../models/ConsumptionLog");
const User = require("../models/User");
const { computeWasteScore, isValidRange } = require("../services/wasteScore");
const config = require("../config");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Records the query wasteScore built, and replays `logs` through the chain. */
function mockLogs(logs) {
  const captured = {};
  ConsumptionLog.find.mockImplementation((query) => {
    captured.query = query;
    return {
      select: () => ({ sort: () => ({ lean: async () => logs }) }),
    };
  });
  return captured;
}

function mockUser(rescueCount) {
  User.findById.mockReturnValue({ select: () => ({ lean: async () => rescueCount }) });
}

/** A log `daysAgo` days in the past. */
function log(reason, daysAgo, { wasRescue = false, productName = "süt" } = {}) {
  return {
    productName,
    reason,
    wasRescue,
    createdAt: new Date(Date.now() - daysAgo * DAY_MS),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser({ rescueCount: 0 });
});

describe("isValidRange", () => {
  it("accepts the four supported ranges and an absent range", () => {
    for (const r of ["week", "month", "year", "all", undefined]) {
      expect(isValidRange(r)).toBe(true);
    }
  });

  it("rejects anything else, including values that could reach Mongo", () => {
    for (const r of ["day", "", "ALL", null, "$ne", 7]) {
      expect(isValidRange(r)).toBe(false);
    }
  });
});

describe("computeWasteScore - empty history", () => {
  it("returns a null score rather than dividing by zero", async () => {
    mockLogs([]);
    const result = await computeWasteScore("u1");

    expect(result.score).toBeNull();
    expect(result.eventCount).toBe(0);
    expect(result.consumedCount).toBe(0);
    expect(result.expiredCount).toBe(0);
    expect(result.rescueBonus).toBe(0);
    expect(result.events).toEqual([]);
  });

  it("still reports the all-time rescue counter from the user document", async () => {
    mockLogs([]);
    mockUser({ rescueCount: 12 });
    expect((await computeWasteScore("u1")).totalRescueCount).toBe(12);
  });

  it("defaults totalRescueCount to 0 when the user document is missing", async () => {
    mockLogs([]);
    mockUser(null);
    expect((await computeWasteScore("u1")).totalRescueCount).toBe(0);
  });
});

describe("computeWasteScore - boundary scores", () => {
  it("scores a perfect record as 100", async () => {
    mockLogs([log("consumed", 0), log("consumed", 5), log("consumed", 30)]);
    expect((await computeWasteScore("u1")).score).toBe(100);
  });

  it("scores an all-waste record as 0", async () => {
    mockLogs([log("expired", 0), log("expired", 5), log("expired", 30)]);
    expect((await computeWasteScore("u1")).score).toBe(0);
  });

  it("scores a same-day 50/50 split as 50", async () => {
    // Equal timestamps => equal weights => the decay cancels out exactly.
    mockLogs([log("consumed", 0), log("expired", 0)]);
    expect((await computeWasteScore("u1")).score).toBe(50);
  });

  it("never exceeds 100 even when the rescue bonus is added to a perfect score", async () => {
    mockLogs([
      log("consumed", 0, { wasRescue: true }),
      log("consumed", 1, { wasRescue: true }),
      log("consumed", 2, { wasRescue: true }),
    ]);
    const result = await computeWasteScore("u1");
    expect(result.score).toBe(100);
    expect(result.rescueBonus).toBeGreaterThan(0);
  });
});

describe("computeWasteScore - exponential decay", () => {
  it("weights a recent event more heavily than an old one", async () => {
    // Recent good + old bad should beat old good + recent bad.
    mockLogs([log("consumed", 0), log("expired", 60)]);
    const recentlyGood = (await computeWasteScore("u1")).score;

    mockLogs([log("expired", 0), log("consumed", 60)]);
    const recentlyBad = (await computeWasteScore("u1")).score;

    expect(recentlyGood).toBeGreaterThan(50);
    expect(recentlyBad).toBeLessThan(50);
    expect(recentlyGood + recentlyBad).toBeCloseTo(100, 1);
  });

  it("matches the documented formula for a hand-computed case", async () => {
    // score = 100 * Σ(w·good) / Σ(w), w = DECAY^daysAgo
    mockLogs([log("consumed", 0), log("expired", 10)]);
    const w0 = 1;
    const w10 = Math.pow(config.WASTE_SCORE_DECAY, 10);
    const expected = Math.round(((100 * w0) / (w0 + w10)) * 10) / 10;

    expect((await computeWasteScore("u1")).score).toBeCloseTo(expected, 1);
  });

  it("lets a long-past mistake fade toward irrelevance", async () => {
    // One year-old failure against one fresh success ~= near perfect.
    mockLogs([log("consumed", 0), log("expired", 365)]);
    expect((await computeWasteScore("u1")).score).toBeGreaterThan(99);
  });

  it("clamps future-dated logs to weight 1 instead of amplifying them", async () => {
    // Math.max(0, daysAgo) guards against clock skew producing DECAY^negative,
    // which would be > 1 and let one bad record dominate the whole score.
    mockLogs([log("expired", -30), log("consumed", 0)]);
    expect((await computeWasteScore("u1")).score).toBe(50);
  });
});

describe("computeWasteScore - rescue bonus", () => {
  it("adds the configured bonus per rescue event", async () => {
    mockLogs([log("consumed", 0, { wasRescue: true }), log("expired", 0)]);
    const result = await computeWasteScore("u1");

    expect(result.rescueBonus).toBe(config.RESCUE_BONUS_PER_EVENT);
    expect(result.score).toBe(50 + config.RESCUE_BONUS_PER_EVENT);
  });

  it("caps the cumulative bonus so it cannot dominate the ratio", async () => {
    const many = Array.from({ length: 200 }, () =>
      log("consumed", 0, { wasRescue: true })
    );
    mockLogs([...many, ...Array.from({ length: 200 }, () => log("expired", 0))]);

    expect((await computeWasteScore("u1")).rescueBonus).toBe(config.RESCUE_BONUS_CAP);
  });
});

describe("computeWasteScore - query construction", () => {
  it("counts only consumed/expired, excluding partial and unspecified events", async () => {
    const captured = mockLogs([]);
    await computeWasteScore("user-42");

    expect(captured.query.userId).toBe("user-42");
    expect(captured.query.reason).toEqual({ $in: ["consumed", "expired"] });
  });

  it("scopes every query to the requesting user", async () => {
    const captured = mockLogs([]);
    await computeWasteScore("user-42", "week");
    expect(captured.query.userId).toBe("user-42");
    expect(User.findById).toHaveBeenCalledWith("user-42");
  });

  it("applies no date filter for 'all' or an absent range", async () => {
    let captured = mockLogs([]);
    await computeWasteScore("u1", "all");
    expect(captured.query.createdAt).toBeUndefined();

    captured = mockLogs([]);
    await computeWasteScore("u1");
    expect(captured.query.createdAt).toBeUndefined();
  });

  it("starts 'week' at the most recent Monday midnight, not 7 days ago", async () => {
    const captured = mockLogs([]);
    await computeWasteScore("u1", "week");

    const start = captured.query.createdAt.$gte;
    expect(start.getDay()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getTime()).toBeLessThanOrEqual(Date.now());
    // A calendar week can never start more than 7 days back.
    expect(Date.now() - start.getTime()).toBeLessThan(7 * DAY_MS);
  });

  it("starts 'month' on the first of the current month at midnight", async () => {
    const captured = mockLogs([]);
    await computeWasteScore("u1", "month");

    const start = captured.query.createdAt.$gte;
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMonth()).toBe(new Date().getMonth());
  });

  it("starts 'year' on January 1st at midnight", async () => {
    const captured = mockLogs([]);
    await computeWasteScore("u1", "year");

    const start = captured.query.createdAt.$gte;
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getFullYear()).toBe(new Date().getFullYear());
  });
});

describe("computeWasteScore - returned payload", () => {
  it("returns raw events for client-side bucketing, with counts", async () => {
    mockLogs([
      log("consumed", 1, { productName: "süt" }),
      log("expired", 2, { productName: "domates" }),
      log("consumed", 3, { productName: "muz", wasRescue: true }),
    ]);

    const result = await computeWasteScore("u1");

    expect(result.eventCount).toBe(3);
    expect(result.consumedCount).toBe(2);
    expect(result.expiredCount).toBe(1);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toEqual({
      productName: "süt",
      reason: "consumed",
      wasRescue: false,
      createdAt: expect.any(Date),
    });
  });

  it("rounds the score to one decimal place", async () => {
    mockLogs([log("consumed", 0), log("consumed", 3), log("expired", 7)]);
    const { score } = await computeWasteScore("u1");
    expect(score).toBe(Math.round(score * 10) / 10);
  });
});
