import type { Product, RunningLowProduct } from "../api";

// In-memory stand-in for the OS notification queue. Real enough to catch
// the regression this suite exists for: a resync that re-queries by
// `content.data.type` AFTER scheduling ends up cancelling the notifications
// it just created, because they carry the same type tag as the old ones.
type StoredNotification = { content: { data?: { type?: string } }; trigger: unknown };
const store = new Map<string, StoredNotification>();
let nextId = 0;

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(
    async ({ content, trigger }: { content: StoredNotification["content"]; trigger: unknown }) => {
      const id = `id-${nextId++}`;
      store.set(id, { content, trigger });
      return id;
    }
  ),
  cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => {
    store.delete(identifier);
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () =>
    Array.from(store.entries()).map(([identifier, value]) => ({
      identifier,
      content: value.content,
      trigger: value.trigger,
    }))
  ),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import * as Notifications from "expo-notifications";
import { syncExpiryNotifications, syncRunningLowNotifications } from "../notifications";

async function scheduledCount(): Promise<number> {
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}

beforeEach(() => {
  store.clear();
  nextId = 0;
  jest.clearAllMocks();
});

function runningLowProduct(overrides: Partial<RunningLowProduct> = {}): RunningLowProduct {
  return {
    productId: "p1",
    name: "yoğurt",
    quantity: 0.15,
    unit: "kg",
    dailyRate: 0.2,
    predictedDaysRemaining: 0.7,
    ...overrides,
  };
}

function expiringProduct(overrides: Partial<Product> = {}): Product {
  const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  return {
    _id: "p1",
    name: "süt",
    quantity: 1,
    unit: "lt",
    source: "manual",
    estimatedShelfLifeDays: 5,
    estimatedExpireDate: future,
    manualExpireDate: null,
    effectiveExpireDate: future,
    expireDateSource: "estimated",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Regression coverage for a real bug: syncRunningLowNotifications/
// syncExpiryNotifications used to cancel old notifications by re-querying
// `getAllScheduledNotificationsAsync()` for the same `data.type` AFTER
// scheduling the new ones — which matched (and deleted) the brand-new
// notifications too, since they carry the same type tag. Net effect: every
// resync silently emptied the queue back to zero. Caught via a live
// on-device diagnostic tool, not by a test, which is why this suite exists now.
// RUNNING_LOW_LOOKAHEAD_DAYS ile aynı sayı — notifications.ts değişirse
// burada da güncellenmesi gerekir, testlerin sihirli sayı tekrarını
// azaltmak için tek yerde tutuluyor.
const DAYS_PER_PRODUCT = 3;

describe("syncRunningLowNotifications", () => {
  it("schedules multiple upcoming days per product, not just the next occurrence", async () => {
    // REGRESSION: gerçek bir kullanıcı raporu — tek bir "bir sonraki an"
    // bildirimi, uygulama birkaç gün açılmazsa sessizce hiç ateşlenmeden
    // sona eriyordu (SKT bildirimleri T-3/T-2/T-1/T-0 ile günler öncesinden
    // kurulduğu için bu sorunu yaşamıyordu, tükenmek üzere hiç yapmıyordu).
    await syncRunningLowNotifications([runningLowProduct()]);
    expect(await scheduledCount()).toBe(DAYS_PER_PRODUCT);

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const triggerDates = scheduled
      .map((n) => (n.trigger as { date: Date }).date.getTime())
      .sort((a, b) => a - b);
    // Ardışık günler arası fark tam 24 saat olmalı (aynı saatte tekrar).
    for (let i = 1; i < triggerDates.length; i++) {
      expect(triggerDates[i] - triggerDates[i - 1]).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("REGRESSION: a second sync with the same product does not wipe the queue to zero", async () => {
    await syncRunningLowNotifications([runningLowProduct()]);
    expect(await scheduledCount()).toBe(DAYS_PER_PRODUCT);

    await syncRunningLowNotifications([runningLowProduct()]);
    expect(await scheduledCount()).toBe(DAYS_PER_PRODUCT);
  });

  it("schedules one notification per upcoming day per product, tagged running-low", async () => {
    await syncRunningLowNotifications([
      runningLowProduct({ productId: "1", name: "yoğurt" }),
      runningLowProduct({ productId: "2", name: "elma" }),
    ]);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    expect(scheduled).toHaveLength(2 * DAYS_PER_PRODUCT);
    expect(scheduled.every((n) => n.content.data?.type === "running-low")).toBe(true);
  });

  it("replacing a two-product list with a one-product list ends at the one-product count", async () => {
    await syncRunningLowNotifications([
      runningLowProduct({ productId: "1", name: "yoğurt" }),
      runningLowProduct({ productId: "2", name: "elma" }),
    ]);
    expect(await scheduledCount()).toBe(2 * DAYS_PER_PRODUCT);

    await syncRunningLowNotifications([runningLowProduct({ productId: "1", name: "yoğurt" })]);
    expect(await scheduledCount()).toBe(DAYS_PER_PRODUCT);
  });

  it("cancels everything when the product list becomes empty", async () => {
    await syncRunningLowNotifications([runningLowProduct()]);
    expect(await scheduledCount()).toBe(DAYS_PER_PRODUCT);

    await syncRunningLowNotifications([]);
    expect(await scheduledCount()).toBe(0);
  });

  it("does not disturb expiry-type notifications", async () => {
    await syncExpiryNotifications([expiringProduct()]);
    const expiryCountBefore = await scheduledCount();
    expect(expiryCountBefore).toBeGreaterThan(0);

    await syncRunningLowNotifications([runningLowProduct()]);

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const expiryStill = scheduled.filter((n) => n.content.data?.type === "expiry");
    expect(expiryStill).toHaveLength(expiryCountBefore);
  });

  it("respects MAX_RUNNING_LOW_NOTIFICATIONS when many products are running low", async () => {
    const manyProducts = Array.from({ length: 10 }, (_, i) =>
      runningLowProduct({ productId: `p${i}`, name: `ürün${i}` })
    );
    await syncRunningLowNotifications(manyProducts);
    // 10 ürün * 3 gün = 30 olurdu, ama tavan 12'de kesiyor.
    expect(await scheduledCount()).toBe(12);
  });
});

describe("syncExpiryNotifications", () => {
  it("REGRESSION: a second sync with the same product does not wipe the queue to zero", async () => {
    await syncExpiryNotifications([expiringProduct()]);
    const countAfterFirst = await scheduledCount();
    expect(countAfterFirst).toBeGreaterThan(0);

    await syncExpiryNotifications([expiringProduct()]);
    expect(await scheduledCount()).toBe(countAfterFirst);
  });

  it("schedules nothing for a product with zero quantity or no expiry date", async () => {
    await syncExpiryNotifications([
      expiringProduct({ _id: "1", quantity: 0 }),
      expiringProduct({ _id: "2", effectiveExpireDate: null }),
    ]);
    expect(await scheduledCount()).toBe(0);
  });
});
