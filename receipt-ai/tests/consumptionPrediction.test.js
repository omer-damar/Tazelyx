// Same approach as wasteScore.test.js: stub the three collections, exercise the
// real rate/threshold arithmetic.
jest.mock("../models/Product", () => ({ find: jest.fn() }));
jest.mock("../models/ConsumptionLog", () => ({ find: jest.fn() }));
jest.mock("../models/ShoppingList", () => ({ find: jest.fn() }));

const Product = require("../models/Product");
const ConsumptionLog = require("../models/ConsumptionLog");
const ShoppingList = require("../models/ShoppingList");
const { predictRunningLow } = require("../services/consumptionPrediction");
const config = require("../config");

const DAY_MS = 24 * 60 * 60 * 1000;

function mockProducts(products) {
  const captured = {};
  Product.find.mockImplementation((query) => {
    captured.query = query;
    return { lean: async () => products };
  });
  return captured;
}

function mockShoppingList(items) {
  const captured = {};
  ShoppingList.find.mockImplementation((query) => {
    captured.query = query;
    return { select: () => ({ lean: async () => items }) };
  });
  return captured;
}

/** logsByProductName: { [name]: log[] } -- mirrors the per-product query. */
function mockConsumptionLogs(logsByProductName) {
  const captured = { queries: [] };
  ConsumptionLog.find.mockImplementation((query) => {
    captured.queries.push(query);
    const logs = logsByProductName[query.productName] || [];
    return { sort: () => ({ select: () => ({ lean: async () => logs }) }) };
  });
  return captured;
}

const product = (name, quantity, unit = "lt") => ({
  _id: `id-${name}`,
  name,
  quantity,
  unit,
});

const usage = (quantity, daysAgo) => ({
  quantity,
  createdAt: new Date(Date.now() - daysAgo * DAY_MS),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockShoppingList([]);
  mockConsumptionLogs({});
});

describe("predictRunningLow - short-circuits", () => {
  it("returns [] when the pantry is empty, without touching the log collection", async () => {
    mockProducts([]);
    await expect(predictRunningLow("u1")).resolves.toEqual([]);
    expect(ConsumptionLog.find).not.toHaveBeenCalled();
    expect(ShoppingList.find).not.toHaveBeenCalled();
  });

  it("skips products with no consumption history (cannot infer a rate)", async () => {
    mockProducts([product("süt", 0.1)]);
    mockConsumptionLogs({});
    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });

  it("queries only products the user still has stock of", async () => {
    const captured = mockProducts([]);
    await predictRunningLow("user-9");
    expect(captured.query).toEqual({ userId: "user-9", quantity: { $gt: 0 } });
  });
});

describe("predictRunningLow - observation window guard", () => {
  it("ignores history shorter than the minimum observation period", async () => {
    // One big usage an hour ago would imply an absurd daily rate.
    mockProducts([product("süt", 0.5)]);
    mockConsumptionLogs({ süt: [usage(2, 0.04)] });
    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });

  it("accepts history just past the minimum observation period", async () => {
    const days = config.MIN_CONSUMPTION_OBSERVATION_DAYS + 0.5;
    mockProducts([product("süt", 0.1)]);
    mockConsumptionLogs({ süt: [usage(5, days)] });

    const [prediction] = await predictRunningLow("u1");
    expect(prediction).toBeDefined();
    expect(prediction.name).toBe("süt");
  });

  it("measures the window from the EARLIEST log, not the latest", async () => {
    mockProducts([product("süt", 0.1)]);
    // 10 units over 10 days => 1/day => 0.1 units left => 0.1 days remaining.
    mockConsumptionLogs({ süt: [usage(5, 10), usage(5, 1)] });

    const [prediction] = await predictRunningLow("u1");
    expect(prediction.dailyRate).toBeCloseTo(1, 1);
    expect(prediction.predictedDaysRemaining).toBeCloseTo(0.1, 1);
  });
});

describe("predictRunningLow - rate arithmetic", () => {
  it("flags a product whose remaining days fall at or under the threshold", async () => {
    // 20 units over 10 days = 2/day; 1 unit left => 0.5 days remaining.
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(20, 10)] });

    const [prediction] = await predictRunningLow("u1");
    expect(prediction).toMatchObject({
      productId: "id-süt",
      name: "süt",
      quantity: 1,
      unit: "lt",
      dailyRate: 2,
      predictedDaysRemaining: 0.5,
    });
  });

  it("does not flag a product with comfortable stock", async () => {
    // 10 units over 10 days = 1/day; 30 units left => 30 days remaining.
    mockProducts([product("pirinç", 30, "kg")]);
    mockConsumptionLogs({ pirinç: [usage(10, 10)] });
    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });

  it("treats a total of exactly zero consumption as no signal", async () => {
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(0, 10)] });
    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });

  it("guards against a negative net total producing a negative rate", async () => {
    // A corrective/negative log must not flip the prediction; totalUsed <= 0
    // short-circuits before the division.
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(2, 10), usage(-3, 5)] });
    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });

  it("counts both full consumption and partial reductions toward the rate", async () => {
    const captured = mockConsumptionLogs({});
    mockProducts([product("süt", 1)]);
    await predictRunningLow("u1");

    expect(captured.queries[0].reason).toEqual({
      $in: ["consumed", "quantity_reduced"],
    });
  });

  it("rounds the reported rate and remaining days for display", async () => {
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(10, 3)] });

    const [prediction] = await predictRunningLow("u1");
    expect(prediction.dailyRate).toBe(Math.round(prediction.dailyRate * 1000) / 1000);
    expect(prediction.predictedDaysRemaining).toBe(
      Math.round(prediction.predictedDaysRemaining * 10) / 10
    );
  });
});

describe("predictRunningLow - shopping-list suppression", () => {
  it("suppresses a product already on the unchecked list", async () => {
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(20, 10)] });
    mockShoppingList([{ name: "süt" }]);

    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });

  it("matches list names case-insensitively under Turkish rules", async () => {
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(20, 10)] });
    mockShoppingList([{ name: "  SÜT  " }]);

    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });

  it("only considers unchecked items, so a bought item stops suppressing", async () => {
    const captured = mockShoppingList([]);
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(20, 10)] });

    const result = await predictRunningLow("u1");
    expect(captured.query).toEqual({ userId: "u1", isChecked: false });
    expect(result).toHaveLength(1);
  });

  it("does not suppress a different product", async () => {
    mockProducts([product("süt", 1)]);
    mockConsumptionLogs({ süt: [usage(20, 10)] });
    mockShoppingList([{ name: "ekmek" }]);

    await expect(predictRunningLow("u1")).resolves.toHaveLength(1);
  });
});

describe("predictRunningLow - ordering", () => {
  it("returns the most urgent product first", async () => {
    mockProducts([
      product("süt", 1), // 20/10d = 2/day -> 0.5 days
      product("ekmek", 0.2), // 10/10d = 1/day -> 0.2 days
      product("peynir", 0.9), // 10/10d = 1/day -> 0.9 days
    ]);
    mockConsumptionLogs({
      süt: [usage(20, 10)],
      ekmek: [usage(10, 10)],
      peynir: [usage(10, 10)],
    });

    const names = (await predictRunningLow("u1")).map((p) => p.name);
    expect(names).toEqual(["ekmek", "süt", "peynir"]);
  });
});

describe("predictRunningLow - known limitations", () => {
  it("SMELL: issues one log query per pantry product (N+1)", async () => {
    const captured = mockConsumptionLogs({});
    mockProducts([product("a", 1), product("b", 1), product("c", 1)]);

    await predictRunningLow("u1");
    expect(captured.queries).toHaveLength(3);
  });

  it("BUG: history is matched by exact name, so renaming a product loses it", async () => {
    // routes/products.js PATCH rewrites Product.name but never rewrites the
    // ConsumptionLog rows, whose productName still holds the old value.
    mockProducts([product("tam yağlı süt", 1)]);
    mockConsumptionLogs({ süt: [usage(20, 10)] });

    await expect(predictRunningLow("u1")).resolves.toEqual([]);
  });
});
