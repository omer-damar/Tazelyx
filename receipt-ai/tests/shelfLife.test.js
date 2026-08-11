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

// --- Regression coverage for AUDIT_BACKEND.md Correctness #C4 -------------
// Word-boundary matching must NOT match a table key that only appears as a
// substring inside a different word.
describe("word-boundary matching avoids false substring matches", () => {
  it("does not date karabiber (black pepper) via the 'biber' key", async () => {
    await expect(getEstimatedShelfLifeDays("karabiber")).resolves.toBe(
      config.DEFAULT_SHELF_LIFE_DAYS
    );
    expect(estimateShelfLifeDaysWithAi).toHaveBeenCalledWith("karabiber");
  });

  it("does not date 'somun ekmek' (bread) via the 'un' (flour) key", async () => {
    estimateShelfLifeDaysWithAi.mockResolvedValue(3);
    await expect(getEstimatedShelfLifeDays("somun ekmek")).resolves.toBe(3);
    expect(estimateShelfLifeDaysWithAi).toHaveBeenCalledWith("somun ekmek");
  });

  it("does not date 'tuzlu kraker' via the 'tuz' (salt) key", async () => {
    estimateShelfLifeDaysWithAi.mockResolvedValue(120);
    await expect(getEstimatedShelfLifeDays("tuzlu kraker")).resolves.toBe(120);
    expect(estimateShelfLifeDaysWithAi).toHaveBeenCalledWith("tuzlu kraker");
  });

  it("still matches a table key that appears as its own word among extra words", async () => {
    // Receipt-derived names often carry quantity/brand noise around the
    // actual product — the word-boundary match must still find it.
    await expect(getEstimatedShelfLifeDays("1 kg domates")).resolves.toBe(7);
    expect(estimateShelfLifeDaysWithAi).not.toHaveBeenCalled();
  });
});

describe("Object.hasOwn guards against inherited Object.prototype keys", () => {
  // A naive `if (shelfLifeMap[normalizedName])` walks the prototype chain,
  // so a product literally named "constructor" or "__proto__" would return
  // a function/object as its day count and corrupt addDaysToDate. Fixed via
  // `Object.hasOwn`, so these now fall through to the AI path like any other
  // unknown name.
  it("does not treat 'constructor' as a table hit", async () => {
    await expect(getEstimatedShelfLifeDays("constructor")).resolves.toBe(
      config.DEFAULT_SHELF_LIFE_DAYS
    );
    expect(estimateShelfLifeDaysWithAi).toHaveBeenCalledWith("constructor");
  });

  it("does not treat '__proto__' as a table hit", async () => {
    await expect(getEstimatedShelfLifeDays("__proto__")).resolves.toBe(
      config.DEFAULT_SHELF_LIFE_DAYS
    );
    expect(estimateShelfLifeDaysWithAi).toHaveBeenCalledWith("__proto__");
  });

  it("produces a valid expire payload for a product named 'constructor'", async () => {
    const info = await buildExpireInfo("constructor");
    expect(Number.isFinite(info.estimatedExpireDate.getTime())).toBe(true);
    expect(Number.isFinite(info.effectiveExpireDate.getTime())).toBe(true);
  });

  it("still resolves ordinary lowercased method-like names via the AI path", async () => {
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

  it("rejects an unparseable manual date instead of silently storing Invalid Date", async () => {
    // Previously buildExpireInfo did no isNaN check of its own, so
    // POST /api/products (which reaches here directly, unlike PATCH which
    // validated first) accepted {"manualExpireDate": "not-a-date"} and only
    // failed later, opaquely, inside Mongoose.
    await expect(buildExpireInfo("domates", "not-a-date")).rejects.toMatchObject({
      status: 400,
    });
  });
});
