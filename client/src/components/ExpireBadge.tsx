import { Text, View } from "react-native";

// Backend'deki config.EXPIRING_SOON_DAYS ile senkron tutulmalı (bkz.
// receipt-ai/config.js) — ileride tek bir kaynağa (ör. bir /config endpoint'i)
// taşınabilir, şimdilik iki tarafta da aynı sabit tekrarlanıyor.
const EXPIRING_SOON_DAYS = 3;

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
  const days = daysUntil(effectiveExpireDate);
  if (days === null) return null;

  if (days < 0) {
    return (
      <View className="rounded-full px-3 py-1" style={{ backgroundColor: "#EF5A5A1A" }}>
        <Text className="text-xs font-semibold" style={{ color: "#EF5A5A" }}>
          Süresi geçti
        </Text>
      </View>
    );
  }

  if (days <= EXPIRING_SOON_DAYS) {
    return (
      <View className="rounded-full px-3 py-1" style={{ backgroundColor: "#D977061A" }}>
        <Text className="text-xs font-semibold" style={{ color: "#D97706" }}>
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
