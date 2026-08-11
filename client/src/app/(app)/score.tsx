import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WasteScoreChart } from "@/components/WasteScoreChart";
import { useAuth } from "@/context/AuthContext";
import { useThemePreference } from "@/context/ThemeContext";
import { useWasteScore } from "@/context/WasteScoreContext";
import { ApiError, getWasteScore, type WasteScore, type WasteScoreRange } from "@/lib/api";
import { categorizeProduct } from "@/lib/categorize";
import { GLOBAL_MOOD_IMAGES } from "@/lib/lyxMoodImages";
import { useDelayedLoading } from "@/lib/useDelayedLoading";
import { bucketWasteScoreEvents } from "@/lib/wasteScoreBuckets";
import { moodTierForScore, MOOD_TIERS, scoreLabel } from "@/lib/wasteScoreTiers";

const RANGE_OPTIONS: { value: WasteScoreRange; label: string }[] = [
  { value: "week", label: "Haftalık" },
  { value: "month", label: "Aylık" },
  { value: "year", label: "Yıllık" },
  { value: "all", label: "Tüm Zamanlar" },
];

type CategoryBreakdownItem = { category: string; count: number; percent: number };

// Tüketilenler/Bozulanlar bölümleri kendi tek rengiyle çiziliyor — ayrım
// zaten bölüm başlığıyla (ve renk koduyla) veriliyor, kategoriler arasında
// ayrı ayrı renk kullanmak (ör. eski çoklu renkli palet) gereksiz gürültü
// katıyordu.
function CategoryBreakdownSection({
  title,
  color,
  items,
}: {
  title: string;
  color: string;
  items: CategoryBreakdownItem[];
}) {
  if (items.length === 0) return null;

  return (
    <View className="mb-4">
      <Text className="text-ink dark:text-white font-semibold text-sm mb-2">{title}</Text>
      {items.map((item) => (
        <View key={item.category} className="mb-2.5">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-ink dark:text-white text-xs font-medium">{item.category}</Text>
            <Text className="text-ink-muted dark:text-slate-400 text-xs">
              {item.count} · %{item.percent}
            </Text>
          </View>
          <View className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
            <View
              style={{
                width: `${item.percent}%`,
                height: "100%",
                backgroundColor: color,
                borderRadius: 999,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

// Native Stack header'ının headerRight slot'u otomatik bir pill/kapsül
// chrome'una sarılır ve bunun üzerinde kontrol yoktur (bkz. AppHeader.tsx'teki
// not). Bu ekranda geri/başlık native header'dan geldiği için, bilgi butonu
// native chrome'un dışına, ekranın kendi içeriğine (aralık seçici satırının
// sağına) yerleştirilir — "i" harfi de font glyph belirsizliğine karşı elle
// iki View'den (nokta + gövde) çizilir.
function InfoButton({ onPress, isDark }: { onPress: () => void; isDark: boolean }) {
  const dotColor = isDark ? "#cbd5e1" : "#6E7A8D";

  return (
    <Pressable onPress={onPress} hitSlop={10} className="ml-2 active:opacity-60">
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#f1f5f9",
          alignItems: "center",
          justifyContent: "center",
        }}>
        <View style={{ alignItems: "center" }}>
          <View
            style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dotColor, marginBottom: 3 }}
          />
          <View style={{ width: 4, height: 12, borderRadius: 2, backgroundColor: dotColor }} />
        </View>
      </View>
    </Pressable>
  );
}

export default function ScoreScreen() {
  const { token } = useAuth();
  const { resolvedScheme } = useThemePreference();
  const { version: globalVersion } = useWasteScore();
  const isDark = resolvedScheme === "dark";
  // Varsayılan aralık "Tüm Zamanlar" — "Aylık" (takvim ayı) varsayılan olsaydı
  // ayın başında (ör. 1 Ağustos) önceki aydaki tüm geçmiş "henüz veri yok"
  // olarak görünürdü, çünkü aralık her zaman "bu ayın 1'inden bugüne" olurdu.
  // Bu varsayılan görünüm ay sınırında sıfırlanmaz; kullanıcı isterse üstteki
  // pillerden Aylık/Haftalık'a geçebilir.
  const [range, setRange] = useState<WasteScoreRange>("all");
  const [data, setData] = useState<WasteScore | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await getWasteScore(token, range);
      setData(result);
      setSelectedBucketIndex(null);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Skor yüklenirken bir hata oluştu."
      );
    } finally {
      setIsLoading(false);
    }
  }, [token, range]);

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, globalVersion])
  );

  const buckets = useMemo(() => (data ? bucketWasteScoreEvents(data.events, range) : []), [data, range]);

  const selectedBucket = selectedBucketIndex !== null ? buckets[selectedBucketIndex] : null;

  // Tüketilen ve bozulan ürünlerin kategori dağılımı ayrı ayrı hesaplanıyor
  // (ör. "sebzelerin çoğu bozuluyor ama süt ürünleri hep tüketiliyor" gibi
  // bir ayrım tek bir karma listeden çıkarılamazdı).
  const categoryBreakdown = useMemo(() => {
    function breakdown(reason: "consumed" | "expired") {
      const events = selectedBucket?.events.filter((event) => event.reason === reason) ?? [];
      if (events.length === 0) return [];

      const counts = new Map<string, number>();
      for (const event of events) {
        const category = categorizeProduct(event.productName);
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }

      return Array.from(counts.entries())
        .map(([category, count]) => ({
          category,
          count,
          percent: Math.round((count / events.length) * 100),
        }))
        .sort((a, b) => b.count - a.count);
    }

    return { consumed: breakdown("consumed"), expired: breakdown("expired") };
  }, [selectedBucket]);

  const mood = moodTierForScore(data?.score ?? null);

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-surface dark:bg-[#0B1220]">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <View className="flex-row items-center mb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            style={{ flex: 1 }}>
            {RANGE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setRange(option.value)}
                className={`px-4 h-9 rounded-full border justify-center ${
                  range === option.value
                    ? "bg-brand-green border-brand-green"
                    : "bg-white dark:bg-[#151F2E] border-slate-200 dark:border-white/10"
              }`}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: range === option.value ? "#ffffff" : isDark ? "#94a3b8" : "#475569",
                }}>
                {option.label}
              </Text>
              </Pressable>
            ))}
          </ScrollView>
          <InfoButton onPress={() => setShowInfo(true)} isDark={isDark} />
        </View>

        {isLoading ? (
          showSpinner ? (
            <View className="items-center justify-center py-20">
              <ActivityIndicator color="#047857" />
            </View>
          ) : null
        ) : errorMessage ? (
          <View className="items-center justify-center py-20 gap-3 px-6">
            <Text className="text-slate-500 dark:text-slate-400 text-center">{errorMessage}</Text>
            <Pressable onPress={load} className="active:opacity-70">
              <Text className="text-brand-green font-semibold">Tekrar dene</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View className="items-center bg-white dark:bg-[#151F2E] rounded-3xl border border-slate-100/80 dark:border-white/10 py-6 mb-4">
              <Image source={GLOBAL_MOOD_IMAGES[mood]} style={{ width: 140, height: 140 }} resizeMode="contain" />
              <Text className="text-ink dark:text-white text-4xl font-bold mt-2">
                {data?.score === null || data?.score === undefined ? "—" : Math.round(data.score)}
              </Text>
              <Text className="text-ink-muted dark:text-slate-400 text-sm mt-1">
                {scoreLabel(data?.score ?? null)}
              </Text>
            </View>

            {data && data.eventCount > 0 ? (
              <View className="bg-white dark:bg-[#151F2E] rounded-3xl border border-slate-100/80 dark:border-white/10 p-4 mb-4">
                <WasteScoreChart
                  buckets={buckets}
                  selectedIndex={selectedBucketIndex}
                  onSelectBucket={(index) =>
                    setSelectedBucketIndex((current) => (current === index ? null : index))
                  }
                  isDark={isDark}
                  consumedTotal={data.consumedCount}
                  expiredTotal={data.expiredCount}
                />

                {selectedBucket ? (
                  selectedBucket.events.length > 0 ? (
                    <View className="mt-5 pt-4 border-t border-slate-100 dark:border-white/10">
                      <Text className="text-ink-muted dark:text-slate-400 text-xs mb-3">
                        {selectedBucket.label}:{" "}
                        <Text className="font-semibold text-brand-green">
                          {selectedBucket.consumed} tükettin
                        </Text>
                        {", "}
                        <Text className="font-semibold" style={{ color: "#EF5A5A" }}>
                          {selectedBucket.expired} bozuldu
                        </Text>
                      </Text>

                      <CategoryBreakdownSection
                        title="Tüketilenler"
                        color="#047857"
                        items={categoryBreakdown.consumed}
                      />
                      <CategoryBreakdownSection
                        title="Bozulanlar"
                        color="#EF5A5A"
                        items={categoryBreakdown.expired}
                      />
                    </View>
                  ) : (
                    <Text className="text-ink-muted dark:text-slate-400 text-xs text-center mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                      {selectedBucket.label} için hiç olay yok.
                    </Text>
                  )
                ) : (
                  <Text className="text-ink-muted dark:text-slate-400 text-xs text-center mt-3">
                    Kategori kırılımını görmek için bir çubuğa dokun
                  </Text>
                )}
              </View>
            ) : (
              <View className="items-center justify-center py-10 gap-3">
                <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
                  <Ionicons name="leaf-outline" size={36} color="#047857" />
                </View>
                <Text className="text-slate-900 dark:text-white font-semibold text-base">
                  Bu dönemde henüz veri yok
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-center px-6">
                  Ürünleri kaydırarak "Tükettim" veya "Bozuldu" olarak işaretledikçe skorun burada
                  oluşacak.
                </Text>
              </View>
            )}

            <View className="flex-row items-center justify-between bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 px-4 py-4">
              <View className="flex-row items-center gap-3">
                <View className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 items-center justify-center">
                  <Ionicons name="ribbon-outline" size={20} color="#D97706" />
                </View>
                <View>
                  <Text className="text-ink dark:text-white font-semibold">Kurtarma</Text>
                  <Text className="text-ink-muted dark:text-slate-400 text-xs">
                    Bozulmadan hemen önce tükettiklerin
                  </Text>
                </View>
              </View>
              <Text className="text-ink dark:text-white text-xl font-bold">
                {data?.totalRescueCount ?? 0}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={showInfo} transparent animationType="fade" onRequestClose={() => setShowInfo(false)}>
        <Pressable
          className="flex-1 justify-end bg-black/40"
          onPress={() => setShowInfo(false)}>
          <Pressable className="bg-white dark:bg-[#151F2E] rounded-t-3xl px-5 pt-2 pb-8 max-h-[85%]">
            <View className="items-center py-2">
              <View className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-ink dark:text-white font-bold text-lg mb-3">
                İsraf Skoru nasıl hesaplanıyor?
              </Text>
              <Text className="text-ink dark:text-slate-300 text-sm leading-5 mb-3">
                Kilerindeki her "Tükettim" veya "Bozuldu" işaretlemesi bir olay olarak sayılır.
                Yakın zamandaki olaylar skoru daha çok etkiler, eski olayların etkisi zamanla
                azalır (yaklaşık 15 günde yarıya iner) — ama hiçbiri tamamen silinmez.
              </Text>
              <Text className="text-ink dark:text-slate-300 text-sm leading-5 mb-3">
                Skor, bu ağırlıklı "tükettim" oranının 0-100 arası bir karşılığıdır: 100 = her şeyi
                zamanında tükettin, 0 = her şeyi israf ettin.
              </Text>
              <Text className="text-ink dark:text-slate-300 text-sm leading-5 mb-4">
                Bir ürünü bozulmasına 3 gün veya daha az kala tüketirsen, bu bir{" "}
                <Text className="font-semibold">Kurtarma</Text> sayılır — skora küçük bir ek puan
                katar, ayrıca skordan bağımsız, hiç sıfırlanmayan bir sayaca da işlenir.
              </Text>

              <Text className="text-ink dark:text-white font-semibold text-sm mb-2">
                Lyx skoruna göre nasıl değişir
              </Text>
              {MOOD_TIERS.map((item) => (
                <View key={item.tier} className="flex-row items-center gap-3 mb-2.5">
                  <Image
                    source={GLOBAL_MOOD_IMAGES[item.tier]}
                    style={{ width: 44, height: 44 }}
                    resizeMode="contain"
                  />
                  <View>
                    <Text className="text-ink dark:text-white text-sm font-medium">{item.label}</Text>
                    <Text className="text-ink-muted dark:text-slate-400 text-xs">
                      Skor {item.range}
                    </Text>
                  </View>
                </View>
              ))}

              <Pressable
                onPress={() => setShowInfo(false)}
                className="bg-brand-green rounded-xl py-3.5 items-center mt-3 active:opacity-80">
                <Text className="text-white text-base font-semibold">Anladım</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
