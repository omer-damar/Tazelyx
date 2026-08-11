import { router } from "expo-router";
import { Image, type ImageSourcePropType, Pressable } from "react-native";

import { moodTierForScore, type LyxMoodTier } from "@/lib/wasteScoreTiers";

// Tier sınırları/etiketleri artık lib/wasteScoreTiers.ts'te TEK yerde
// tanımlı (bkz. o dosyadaki açıklama) — burada, mevcut importları
// (`@/components/LyxMascot`'tan bu iki adı alan diğer dosyalar) bozmamak
// için yeniden dışa aktarılıyor.
export type { LyxMoodTier };
export { moodTierForScore };

// Her sekmenin kendi karakteri var; her karakter skora göre (kritik/düşük/
// orta/iyi/harika) 5 farklı poz/ifade gösterir. Görsel seti çağıran taraf
// tarafından `moodImages` prop'uyla sağlanır (bkz. lib/lyxMoodImages.ts).
export function LyxMascot({
  size = 87,
  moodImages,
  score,
}: {
  size?: number;
  moodImages: Record<LyxMoodTier, ImageSourcePropType>;
  score: number | null;
}) {
  const tier = moodTierForScore(score);

  return (
    <Pressable
      onPress={() => router.push("/(app)/score")}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="İsraf skorunu görüntüle"
      className="active:opacity-70">
      <Image source={moodImages[tier]} style={{ width: size, height: size }} resizeMode="contain" />
    </Pressable>
  );
}
