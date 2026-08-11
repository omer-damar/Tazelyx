// Tek kaynak: mascot poz seçimi (LyxMascot.tsx), skor detay ekranındaki
// büyük etiket ve bilgi modalındaki aralık lejandı bu 5 sınırı üç ayrı
// yerde tekrar ediyordu — biri değişip diğerleri unutulursa mascot/etiket/
// lejand birbiriyle çelişebilirdi.
export type LyxMoodTier = "kritik" | "dusuk" | "orta" | "iyi" | "harika";

export const MOOD_TIERS: { tier: LyxMoodTier; max: number; label: string; range: string }[] = [
  { tier: "kritik", max: 20, label: "Kritik", range: "0-20" },
  { tier: "dusuk", max: 40, label: "Düşük", range: "21-40" },
  { tier: "orta", max: 60, label: "Orta", range: "41-60" },
  { tier: "iyi", max: 80, label: "İyi", range: "61-80" },
  { tier: "harika", max: 100, label: "Harika", range: "81-100" },
];

// Skor için henüz veri yoksa nötr "orta" ifadesi kullanılır — global skor
// setindeki ayrı "meraklı" görseli yok, sayfa-özel 5'li setler yalnızca bu
// 5 tier'i kapsar.
export function moodTierForScore(score: number | null): LyxMoodTier {
  if (score === null) return "orta";
  const match = MOOD_TIERS.find((entry) => score <= entry.max);
  return (match ?? MOOD_TIERS[MOOD_TIERS.length - 1]).tier;
}

export function scoreLabel(score: number | null): string {
  if (score === null) return "Henüz veri yok";
  const tier = moodTierForScore(score);
  return MOOD_TIERS.find((entry) => entry.tier === tier)?.label ?? "";
}
