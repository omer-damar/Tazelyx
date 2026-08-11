import { Text, View } from "react-native";

import { useThemePreference } from "@/context/ThemeContext";

// Backend'deki config.EXPIRING_SOON_DAYS ile senkron tutulmalı (bkz.
// receipt-ai/config.js) — ileride tek bir kaynağa (ör. bir /config endpoint'i)
// taşınabilir, şimdilik iki tarafta da aynı sabit tekrarlanıyor.
export const EXPIRING_SOON_DAYS = 3;

// Ham milisaniye farkını 24 saate bölüp yuvarlamak yanlış sonuç verir — bu,
// şu andan itibaren 24 saatlik kayan bir pencere hesaplar, takvim günü değil.
// Örneğin bir ürün dün akşam bozulduysa ama aradan henüz 24 saat geçmemişse,
// bu yöntem hâlâ "bugün bozuluyor" gösterir. Bunun yerine iki tarih yerel
// takvim günü (yıl/ay/gün, saatten bağımsız) olarak karşılaştırılır —
// backend'in "Yakında Bozulacak" sorgusuyla tutarlı kalmak için.
export function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const target = new Date(dateString);
  const now = new Date();
  const startOfTargetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = startOfTargetDay.getTime() - startOfToday.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function ExpireBadge({ effectiveExpireDate }: { effectiveExpireDate: string | null }) {
  const { resolvedScheme } = useThemePreference();
  const isDark = resolvedScheme === "dark";
  const days = daysUntil(effectiveExpireDate);
  if (days === null) return null;

  // Bu rozetlerin renkleri her iki temada da AYNIYDI — koyu #151F2E kart
  // üzerinde %10 opak bir zemine karşı ~4.0-4.3:1 kontrastla WCAG AA'nın
  // (12px yarı-kalın metin için 4.5:1) altında kalıyordu, üstelik bunlar
  // uygulamanın en güvenlik-kritik etiketleri ("Süresi geçti" gibi).
  // Koyu modda daha açık tonlar kullanılıyor.
  if (days < 0) {
    const color = isDark ? "#F87171" : "#EF5A5A";
    return (
      <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${color}1A` }}>
        <Text className="text-xs font-semibold" style={{ color }}>
          Süresi geçti
        </Text>
      </View>
    );
  }

  if (days <= EXPIRING_SOON_DAYS) {
    const color = isDark ? "#FBBF24" : "#D97706";
    return (
      <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${color}1A` }}>
        <Text className="text-xs font-semibold" style={{ color }}>
          {days === 0 ? "Bugün bozuluyor" : `${days} gün kaldı`}
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-slate-100 dark:bg-white/10 rounded-full px-3 py-1">
      <Text className="text-ink-muted dark:text-slate-400 text-xs font-semibold">
        {days} gün kaldı
      </Text>
    </View>
  );
}
