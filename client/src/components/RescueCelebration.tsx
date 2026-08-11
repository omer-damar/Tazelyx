import { useEffect } from "react";
import { Image, type ImageSourcePropType, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const POP_IN_MS = 260;
const HOLD_MS = 1400;
const FADE_OUT_MS = 220;

// Sıradan "tüketildi" kaydırması (bkz. (tabs)/index.tsx) her ürün için aynı
// jenerik toast'ı gösteriyordu — ürünün son kullanma tarihine 3 hafta mı 3
// gün mü kaldığı hiç ayırt edilmiyordu. İsraf Skoru'nun asıl ödüllendirmesi
// gereken an tam olarak bu ikincisi (bir ürünü çöpe gitmeden son anda
// değerlendirmek), bu yüzden bu "kurtarma" anı, dokunmaya gerek olmadan
// birkaç saniye içinde kendiliğinden kaybolan, alttaki geri-al toast'ıyla
// çakışmayan (ekranın üst kısmında) ayrı ve daha belirgin bir tepki alıyor.
export function RescueCelebration({
  visible,
  productName,
  moodImage,
  onHide,
}: {
  visible: boolean;
  productName: string;
  moodImage: ImageSourcePropType;
  onHide: () => void;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;

    progress.value = 0;
    progress.value = withSequence(
      withTiming(1, { duration: POP_IN_MS, easing: Easing.out(Easing.back(1.4)) }),
      withDelay(
        HOLD_MS,
        withTiming(0, { duration: FADE_OUT_MS }, (finished) => {
          if (finished) runOnJS(onHide)();
        })
      )
    );
    // productName de bağımlılıklarda: görünürken art arda başka bir ürün
    // "kurtarılırsa" animasyon yeni ürün için baştan oynatılsın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, productName]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.85 + progress.value * 0.15 },
      { translateY: (1 - progress.value) * -12 },
    ],
  }));

  if (!visible) return null;

  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-24 items-center z-50">
      <Animated.View style={animatedStyle}>
        <View
          className="bg-white dark:bg-[#151F2E] rounded-3xl px-5 py-4 items-center border border-emerald-100 dark:border-emerald-500/20"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
            maxWidth: 280,
          }}>
          <Image source={moodImage} style={{ width: 84, height: 84 }} resizeMode="contain" />
          <Text className="text-ink dark:text-white font-bold text-base mt-1">Kurtardın!</Text>
          <Text
            className="text-ink-muted dark:text-slate-400 text-sm text-center mt-0.5"
            numberOfLines={1}>
            "{productName}" son anda değerlendirildi
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}
