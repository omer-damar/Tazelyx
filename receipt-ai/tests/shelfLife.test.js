// The AI fallback is the only impure part of shelfLife.js (a network call).
// Mocking just that one module keeps the rule-based table under test and lets
// us assert exactly WHEN the paid AI path is reached.
jest.mock("../services/shelfLifeAi", () => ({
  estimateShelfLifeDaysWithAi: jest.fn(),
}));

const { estimateShelfLifeDaysWithAi } = require("../services/shelfLifeAi");
const {
  normalizeProductName,
  cleanDisplayName,
  getEstimatedShelfLifeDays,
  addDaysToDate,
  buildExpireInfo,
  startOfToday,
} = require("../services/shelfLife");
const config = require("../config");

beforeEach(() => {
  jest.clearAllMocks();
  estimateShelfLifeDaysWithAi.mockResolvedValue(null);
});

describe("normalizeProductName", () => {
  it("folds every Turkish letter to ASCII so table keys can stay ASCII-only", () => {
    expect(normalizeProductName("SOĞAN")).toBe("sogan");
    expect(normalizeProductName("Salatalık")).toBe("salatalik");
    expect(normalizeProductName("ÇİLEK")).toBe("cilek");
    expect(normalizeProductName("Süt")).toBe("sut");
    expect(normalizeProductName("PATLICAN")).toBe("patlican");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(normalizeProductName("  yeşil   mercimek  ")).toBe("yesil mercimek");
  });

  it("strips combining diacritics left by NFD decomposition", () => {
    expect(normalizeProductName("i̇thal")).toBe("ithal");
  });
});

describe("cleanDisplayName", () => {
  it("keeps Turkish letters that normalizeProductName would destroy", () => {
    expect(cleanDisplayName("İthal MUZ")).toBe("ithal muz");
    expect(cleanDisplayName("SOĞAN")).toBe("soğan");
  });

  it("lowercases with Turkish rules so 'MISIR' does not become 'misir'", () => {
    expect(cleanDisplayName("MISIR")).toBe("mısır");
  });

  it("collapses runs of whitespace and trims", () => {
    expect(cleanDisplayName("  tam   yağlı  süt ")).toBe("tam yağlı süt");
  });

  it("throws on a non-string input (no type guard upstream)", () => {
    // routes/products.js > buildProductInput only checks `!name`, so a JSON
    // body of {"name": 123} reaches here and 500s. See AUDIT_BACKEND.md #C5.
    expect(() => cleanDisplayName(123)).toThrow(TypeError);
  });
});

describe("getEstimatedShelfLifeDays - exact table hits", () => {
  it("returns the mapped value without ever calling the AI", async () => {
    await expect(getEstimatedShelfLifeDays("domates")).resolves.toBe(7);
    await expect(getEstimatedShelfLifeDays("pirinç")).resolves.toBe(365);
    await expect(getEstimatedShelfLifeDays("SOĞAN")).resolves.toBe(30);
    expect(estimateShelfLifeDaysWithAi).not.toHaveBeenCalled();
  });

  it("matches multi-word keys exactly", async () => {
    await expect(getEstimatedShelfLifeDays("mercimek yeşil")).resolves.toBe(180);
  });
});

describe("getEstimatedShelfLifeDays - AI fallback", () => {
  it("consults the AI only when nothing in the table matches", async () => {
    estimateShelfLifeDaysWithAi.mockResolvedValue(120);
    await expect(getEstimatedShelfLifeDays("kraker")).resolves.toBe(120);
    expect(estimateShelfLifeDaysWithAi).toHaveBeenCalledWith("kraker");
  });

  it("falls back to the configured default when the AI returns null", async () => {
    estimateShelfLifeDaysWithAi.mockResolvedValue(null);
    await expect(getEstimatedShelfLifeDays("zzz bilinmeyen")).resolves.toBe(
      config.DEFAULT_SHELF_LIFE_DAYS
    );
  });

  it("passes the original (un-normalized) name to the AI for better context", async () => {
    estimateShelfLifeDaysWithAi.mockResolvedValue(90);
    await getEstimatedShelfLifeDays("Böğürtlen Reçeli");
    expect(estimateShelfLifeDaysWithAi).toHaveBeenCalledWith("Böğürtlen Reçeli");
  });
});

// --- BUGS (see AUDIT_BACKEND.md, Correctness #C4 and #C6) ------------------
// The substring fallback loop `if (normalizedName.includes(key))` matches any
// table key appearing ANYWHERE in the product name, with no word boundary and
// in Object.keys insertion order. These tests assert the CURRENT WRONG values
// so the damage is visible and a fix is detected.
describe("BUG: unanchored substring matching mis-dates products", () => {
  it("dates karabiber (black pepper) as fresh 'biber' -- 7 days instead of years", async () => {
    await expect(getEstimatedShelfLifeDays("karabiber")).resolves.toBe(7);
    expect(estimateShelfLifeDaysWithAi).not.toHaveBeenCalled();
  });

  it("dates 'somun ekmek' (bread) via the 'un' (flour) key -- 180 days", async () => {
    await expect(getEstimatedShelfLifeDays("somun ekmek")).resolves.toBe(180);
  });

  it("dates 'tuzlu kraker' via the 'tuz' (salt) key -- 730 days", async () => {
    await expect(getEstimatedShelfLifeDays("tuzlu kraker")).resolves.toBe(730);
  });

  it("shadows the AI for names it should have escalated", async () => {
    // All three above silently skip the AI path that exists precisely to
    // handle packaged goods the table does not know.
    estimateShelfLifeDaysWithAi.mockResolvedValue(365);
    await getEstimatedShelfLifeDays("karabiber");
    await getEstimatedShelfLifeDays("tuzlu kraker");
    expect(estimateShelfLifeDaysWithAi).not.toHaveBeenCalled();
  });
});

describe("BUG: inherited Object.prototype keys are treated as table hits", () => {
  // `if (shelfLifeMap[normalizedName])` walks the prototype chain, so any
  // inherited property name is a truthy "hit" and its value is returned as a
  // day count. normalizeProductName() lowercases first, so only the all-
  // lowercase prototype keys are reachable: "constructor" and "__proto__"
  // ("toString"/"valueOf" become "tostring"/"valueof" and miss).
  // Fix: `if (Object.hasOwn(shelfLifeMap, normalizedName))`.
  it("returns a function for a product literally named 'constructor'", async () => {
    const result = await getEstimatedShelfLifeDays("constructor");
    expect(typeof result).toBe("function");
    expect(estimateShelfLifeDaysWithAi).not.toHaveBeenCalled();
  });

  it("returns Object.prototype for a product named '__proto__'", async () => {
    const result = await getEstimatedShelfLifeDays("__proto__");
    expect(typeof result).toBe("object");
    expect(estimateShelfLifeDaysWithAi).not.toHaveBeenCalled();
  });

  it("produces an Invalid Date once that value reaches addDaysToDate", async () => {
    const days = await getEstimatedShelfLifeDays("constructor");
    expect(Number.isFinite(days)).toBe(false);
    expect(addDaysToDate(new Date("2026-01-01T00:00:00Z"), days).getTime()).toBeNaN();
  });

  it("corrupts the whole expire payload for such a product", async () => {
    const info = await buildExpireInfo("constructor");
    expect(info.estimatedExpireDate.getTime()).toBeNaN();
    expect(info.effectiveExpireDate.getTime()).toBeNaN();
  });

  it("is not reachable through ordinary lowercased method names", async () => {
    // Confirms the blast radius is limited to the two lowercase keys above.
    estimateShelfLifeDaysWithAi.mockResolvedValue(42);
    await expect(getEstimatedShelfLifeDays("toString")).resolves.toBe(42);
    await expect(getEstimatedShelfLifeDays("valueOf")).resolves.toBe(42);
  });
});

describe("addDaysToDate", () => {
  it("adds whole days", () => {
    const base = new Date("2026-03-10T09:30:00Z");
    expect(addDaysToDate(base, 5).toISOString()).toBe("2026-03-15T09:30:00.000Z");
  });

  it("does not mutate the date it was given", () => {
    const base = new Date("2026-03-10T09:30:00Z");
    addDaysToDate(base, 5);
    expect(base.toISOString()).toBe("2026-03-10T09:30:00.000Z");
  });

  it("rolls over month and year boundaries", () => {
    expect(addDaysToDate(new Date("2026-01-30T00:00:00Z"), 3).getUTCMonth()).toBe(1);
    expect(addDaysToDate(new Date("2026-12-30T00:00:00Z"), 5).getUTCFullYear()).toBe(2027);
  });

  it("handles the leap day correctly", () => {
    expect(addDaysToDate(new Date("2028-02-28T00:00:00Z"), 1).getUTCDate()).toBe(29);
  });

  it("preserves the time-of-day component -- the reason expiry is not calendar-aligned", () => {
    // Documented in shelfLife.js: a product added at 20:00 'expires' at 20:00,
    // which is why the expiring-soon queries need a start-of-day lower bound.
    const base = new Date("2026-03-10T20:00:00Z");
    expect(addDaysToDate(base, 3).getUTCHours()).toBe(20);
  });

  it("yields an Invalid Date for an out-of-range day count", () => {
    // An AI estimate is never clamped upstream (shelfLifeAi.js only checks > 0).
    expect(addDaysToDate(new Date(), 1e9).getTime()).toBeNaN();
  });
});

describe("startOfToday", () => {
  it("returns local midnight of the current day", () => {
    const start = startOfToday();
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(start.getDate()).toBe(new Date().getDate());
  });

  it("is never in the future", () => {
    expect(startOfToday().getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("buildExpireInfo", () => {
  it("uses the estimate when no manual date is given", async () => {
    const info = await buildExpireInfo("domates");
    expect(info.estimatedShelfLifeDays).toBe(7);
    expect(info.expireDateSource).toBe("estimated");
    expect(info.manualExpireDate).toBeNull();
    expect(info.effectiveExpireDate).toEqual(info.estimatedExpireDate);
  });

  it("lets a manual date win while still recording the estimate", async () => {
    const info = await buildExpireInfo("domates", "2026-12-31");
    expect(info.expireDateSource).toBe("manual");
    expect(info.effectiveExpireDate.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(info.manualExpireDate).toEqual(info.effectiveExpireDate);
    // The estimate is retained so clearing the manual date can restore it.
    expect(info.estimatedShelfLifeDays).toBe(7);
  });

  it("treats an empty-string manual date as absent", async () => {
    const info = await buildExpireInfo("domates", "");
    expect(info.expireDateSource).toBe("estimated");
  });

  it("BUG: accepts an unparseable manual date and stores Invalid Date", async () => {
    // buildExpireInfo does no isNaN check of its own. POST /api/products
    // reaches here directly (unlike PATCH, which validates first), so a body of
    // {"manualExpireDate": "not-a-date"} is only caught later by Mongoose.
    const info = await buildExpireInfo("domates", "not-a-date");
    expect(info.expireDateSource).toBe("manual");
    expect(info.effectiveExpireDate.getTime()).toBeNaN();
  });
});
