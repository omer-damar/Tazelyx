import { daysUntil } from "../ExpireBadge";
import { moodTierForScore, type LyxMoodTier } from "../LyxMascot";

// Bu iki saf fonksiyon, React Native bileşenleriyle aynı dosyada yaşıyor.
// Testler hiçbir şey render etmiyor; `react-native`/`expo-router` importları
// jest.config.js'teki moduleNameMapper üzerinden stub'lanıyor.

describe("moodTierForScore", () => {
  it("returns the neutral 'orta' tier when there is no score yet", () => {
    expect(moodTierForScore(null)).toBe("orta");
  });

  it("maps each tier at its exact inclusive upper boundary", () => {
    const boundaries: [number, LyxMoodTier][] = [
      [20, "kritik"],
      [40, "dusuk"],
      [60, "orta"],
      [80, "iyi"],
      [100, "harika"],
    ];
    for (const [score, tier] of boundaries) {
      expect(moodTierForScore(score)).toBe(tier);
    }
  });

  it("flips to the next tier one point past each boundary", () => {
    expect(moodTierForScore(21)).toBe("dusuk");
    expect(moodTierForScore(41)).toBe("orta");
    expect(moodTierForScore(61)).toBe("iyi");
    expect(moodTierForScore(81)).toBe("harika");
  });

  it("handles fractional scores just above a boundary", () => {
    // Backend ham (yuvarlanmamış) skor döndürebiliyor; score.tsx yalnızca
    // GÖSTERİRKEN Math.round uyguluyor, tier hesabı ham değeri görüyor.
    expect(moodTierForScore(20.0001)).toBe("dusuk");
    expect(moodTierForScore(80.5)).toBe("harika");
  });

  it("clamps sensibly outside the 0-100 range", () => {
    expect(moodTierForScore(0)).toBe("kritik");
    expect(moodTierForScore(-10)).toBe("kritik");
    expect(moodTierForScore(999)).toBe("harika");
  });
});

describe("daysUntil", () => {
  // Takvim GÜNÜ farkı hesaplanmalı, kayan 24 saatlik pencere değil.
  const NOW = new Date(2025, 0, 15, 23, 30, 0); // 15 Ocak 2025, 23:30

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("returns null when there is no expiry date", () => {
    expect(daysUntil(null)).toBeNull();
  });

  it("returns 0 for anything expiring today, regardless of time of day", () => {
    expect(daysUntil(new Date(2025, 0, 15, 0, 1).toISOString())).toBe(0);
    expect(daysUntil(new Date(2025, 0, 15, 23, 59).toISOString())).toBe(0);
  });

  it("uses calendar days, not a rolling 24h window", () => {
    // Sadece 45 dakika sonrası — ama takvimde YARIN. Ham ms farkı 24'e
    // bölünseydi 0 ("bugün bozuluyor") derdi; doğru cevap 1.
    const in45Minutes = new Date(2025, 0, 16, 0, 15);
    expect(in45Minutes.getTime() - NOW.getTime()).toBeLessThan(24 * 60 * 60 * 1000);
    expect(daysUntil(in45Minutes.toISOString())).toBe(1);
  });

  it("returns negative day counts for already-expired products", () => {
    expect(daysUntil(new Date(2025, 0, 14, 8).toISOString())).toBe(-1);
    expect(daysUntil(new Date(2024, 11, 31, 8).toISOString())).toBe(-15);
  });

  it("counts forward across a month boundary", () => {
    expect(daysUntil(new Date(2025, 0, 18, 6).toISOString())).toBe(3);
    expect(daysUntil(new Date(2025, 1, 1, 6).toISOString())).toBe(17);
  });
});
