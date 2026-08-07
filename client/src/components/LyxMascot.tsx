import { router } from "expo-router";
import { Image, type ImageSourcePropType, Pressable } from "react-native";

export type LyxMoodTier = "kritik" | "dusuk" | "orta" | "iyi" | "harika";

// Skor için henüz veri yoksa nötr "orta" ifadesi kullanılır — global skor
// setindeki ayrı "meraklı" görseli burada yok, sayfa-özel 5'li setler
// yalnızca bu 5 tier'i kapsar.
export function moodTierForScore(score: number | null): LyxMoodTier {
  if (score === null) return "orta";
  if (score <= 20) return "kritik";
  if (score <= 40) return "dusuk";
  if (score <= 60) return "orta";
  if (score <= 80) return "iyi";
  return "harika";
}

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
    <Pressable onPress={() => router.push("/(app)/score")} hitSlop={8} className="active:opacity-70">
      <Image source={moodImages[tier]} style={{ width: size, height: size }} resizeMode="contain" />
    </Pressable>
  );
}
