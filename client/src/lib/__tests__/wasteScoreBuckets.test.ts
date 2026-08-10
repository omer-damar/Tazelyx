import type { WasteScoreEvent } from "../api";
import { bucketWasteScoreEvents } from "../wasteScoreBuckets";

// Bucket'lama "şu an"a bağlı (aylık aralıkta içinde bulunulan ayın gün
// sayısı, "all" aralığında veri yoksa içinde bulunulan yıl). Testleri
// deterministik tutmak için sistem saati sabitleniyor.
// 2025-01-15 -> Ocak (31 gün, ceil(31/7)=5 hafta), Çarşamba.
const NOW = new Date(2025, 0, 15, 12, 0, 0);

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

// Yerel saatle kurulur — bucket'lama getDay()/getDate()/getMonth() (hepsi
// yerel) kullanıyor, bu yüzden UTC literal kullanmak testi TZ'ye bağımlı
// yapardı.
function event(
  date: Date,
  reason: "consumed" | "expired" = "consumed",
  productName = "Süt"
): WasteScoreEvent {
  return { productName, reason, wasRescue: false, createdAt: date.toISOString() };
}

describe("bucketWasteScoreEvents — week", () => {
  it("returns seven Monday-first weekday buckets even with no events", () => {
    const buckets = bucketWasteScoreEvents([], "week");
    expect(buckets.map((b) => b.label)).toEqual(["Pzt", "Sal", "Çrş", "Prş", "Cum", "Cmt", "Paz"]);
    expect(buckets.every((b) => b.consumed === 0 && b.expired === 0)).toBe(true);
  });

  it("places Monday at index 0 and Sunday at index 6 (JS getDay() is Sunday-first)", () => {
    const monday = new Date(2025, 0, 13, 10);
    const sunday = new Date(2025, 0, 19, 10);
    expect(monday.getDay()).toBe(1);
    expect(sunday.getDay()).toBe(0);

    const buckets = bucketWasteScoreEvents([event(monday), event(sunday)], "week");
    expect(buckets[0].consumed).toBe(1);
    expect(buckets[6].consumed).toBe(1);
  });

  it("counts consumed and expired separately and keeps the raw events", () => {
    const wednesday = new Date(2025, 0, 15, 9);
    const buckets = bucketWasteScoreEvents(
      [
        event(wednesday, "consumed", "Süt"),
        event(wednesday, "expired", "Domates"),
        event(wednesday, "expired", "Marul"),
      ],
      "week"
    );

    expect(buckets[2].consumed).toBe(1);
    expect(buckets[2].expired).toBe(2);
    expect(buckets[2].events.map((e) => e.productName)).toEqual(["Süt", "Domates", "Marul"]);
  });
});

describe("bucketWasteScoreEvents — month", () => {
  it("creates one bucket per (partial) week of the CURRENT month", () => {
    // Ocak 2025 = 31 gün -> ceil(31/7) = 5 bucket.
    const buckets = bucketWasteScoreEvents([], "month");
    expect(buckets).toHaveLength(5);
    expect(buckets.map((b) => b.label)).toEqual([
      "1. Hafta",
      "2. Hafta",
      "3. Hafta",
      "4. Hafta",
      "5. Hafta",
    ]);
  });

  it("puts days 1-7 in week 1 and day 8 in week 2 (boundary check)", () => {
    const buckets = bucketWasteScoreEvents(
      [
        event(new Date(2025, 0, 1, 9)),
        event(new Date(2025, 0, 7, 9)),
        event(new Date(2025, 0, 8, 9)),
      ],
      "month"
    );
    expect(buckets[0].consumed).toBe(2);
    expect(buckets[1].consumed).toBe(1);
  });

  it("clamps the last days of the month into the final bucket", () => {
    // Gün 29/30/31 -> floor(30/7)=4 zaten son bucket; clamp Şubat gibi kısa
    // aylarda devreye giriyor ama burada da son bucket'a düşmeli.
    const buckets = bucketWasteScoreEvents(
      [event(new Date(2025, 0, 29, 9)), event(new Date(2025, 0, 31, 9), "expired")],
      "month"
    );
    expect(buckets[buckets.length - 1].consumed).toBe(1);
    expect(buckets[buckets.length - 1].expired).toBe(1);
  });
});

describe("bucketWasteScoreEvents — year", () => {
  it("returns twelve short month labels and indexes by calendar month", () => {
    const buckets = bucketWasteScoreEvents(
      [event(new Date(2025, 0, 5, 9)), event(new Date(2025, 11, 20, 9), "expired")],
      "year"
    );

    expect(buckets).toHaveLength(12);
    expect(buckets[0].label).toBe("Oca");
    expect(buckets[11].label).toBe("Ara");
    expect(buckets[0].consumed).toBe(1);
    expect(buckets[11].expired).toBe(1);
  });
});

describe("bucketWasteScoreEvents — all", () => {
  it("falls back to a single empty bucket for the current year when there is no data", () => {
    const buckets = bucketWasteScoreEvents([], "all");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].label).toBe("2025");
    expect(buckets[0].consumed).toBe(0);
    expect(buckets[0].expired).toBe(0);
  });

  it("groups by year, ascending, with one bucket per distinct year present", () => {
    const buckets = bucketWasteScoreEvents(
      [
        event(new Date(2024, 5, 1, 9)),
        event(new Date(2023, 2, 1, 9), "expired"),
        event(new Date(2024, 8, 1, 9), "expired"),
      ],
      "all"
    );

    expect(buckets.map((b) => b.label)).toEqual(["2023", "2024"]);
    expect(buckets[0].expired).toBe(1);
    expect(buckets[1].consumed).toBe(1);
    expect(buckets[1].expired).toBe(1);
  });
});
