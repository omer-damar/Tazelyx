import { Pressable, ScrollView, Text, View } from "react-native";

import type { WasteScoreBucket } from "@/lib/wasteScoreBuckets";

const CONSUMED_COLOR = "#047857";
const EXPIRED_COLOR = "#EF5A5A";
const BAR_AREA_HEIGHT = 140;
const BAR_WIDTH = 28;
const MIN_BAR_HEIGHT = 3;

// react-native-chart-kit yerine elle çizilmiş bir stacked bar chart —
// kütüphanenin tıklama/dokunma desteği güvenilir değildi ve görünümü
// uygulamanın geri kalanındaki premium tasarım diliyle (yuvarlak köşeler,
// marka renkleri, koyu mod) uyuşmuyordu. Her çubuk tıklanabilir; seçili
// bucket'ın index'i yukarı bildiriliyor, kategori kırılımı score.tsx'te
// ayrıca render ediliyor.
export function WasteScoreChart({
  buckets,
  selectedIndex,
  onSelectBucket,
  isDark,
  consumedTotal,
  expiredTotal,
}: {
  buckets: WasteScoreBucket[];
  selectedIndex: number | null;
  onSelectBucket: (index: number) => void;
  isDark: boolean;
  consumedTotal: number;
  expiredTotal: number;
}) {
  const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.consumed + bucket.expired));

  return (
    <View>
      <View className="flex-row items-center justify-center gap-4 mb-3">
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CONSUMED_COLOR }} />
          <Text className="text-ink-muted dark:text-slate-400 text-xs">
            Tükettim <Text className="font-semibold">({consumedTotal})</Text>
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: EXPIRED_COLOR }} />
          <Text className="text-ink-muted dark:text-slate-400 text-xs">
            Bozuldu <Text className="font-semibold">({expiredTotal})</Text>
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4, gap: 14, alignItems: "flex-end" }}>
        {buckets.map((bucket, index) => {
          const total = bucket.consumed + bucket.expired;
          const barHeight = total === 0 ? MIN_BAR_HEIGHT : Math.max(6, (total / maxTotal) * BAR_AREA_HEIGHT);
          const consumedHeight = total === 0 ? 0 : (bucket.consumed / total) * barHeight;
          const expiredHeight = total === 0 ? barHeight : barHeight - consumedHeight;
          const selected = selectedIndex === index;

          return (
            <Pressable
              key={`${bucket.label}-${index}`}
              onPress={() => onSelectBucket(index)}
              className="items-center active:opacity-70"
              style={{ width: BAR_WIDTH + 12 }}>
              {total > 0 ? (
                <Text className="text-ink-muted dark:text-slate-400 text-[10px] mb-1">{total}</Text>
              ) : (
                <View style={{ height: 14 }} />
              )}
              <View
                style={{
                  height: BAR_AREA_HEIGHT,
                  justifyContent: "flex-end",
                  alignItems: "center",
                  width: BAR_WIDTH + 12,
                  borderRadius: 10,
                  backgroundColor: selected ? (isDark ? "rgba(25,199,163,0.14)" : "rgba(4,120,87,0.08)") : "transparent",
                  paddingTop: 4,
                }}>
                <View
                  style={{
                    width: BAR_WIDTH,
                    borderTopLeftRadius: 6,
                    borderTopRightRadius: 6,
                    overflow: "hidden",
                    backgroundColor: total === 0 ? (isDark ? "#334155" : "#e2e8f0") : undefined,
                  }}>
                  {total > 0 ? (
                    <>
                      <View style={{ height: expiredHeight, backgroundColor: EXPIRED_COLOR }} />
                      <View style={{ height: consumedHeight, backgroundColor: CONSUMED_COLOR }} />
                    </>
                  ) : (
                    <View style={{ height: MIN_BAR_HEIGHT }} />
                  )}
                </View>
              </View>
              <Text
                className={`text-xs mt-1.5 ${
                  selected
                    ? "text-brand-green dark:text-[#19C7A3] font-semibold"
                    : "text-ink-muted dark:text-slate-400"
                }`}>
                {bucket.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
