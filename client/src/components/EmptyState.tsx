import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

// Liste ekranlarının (Kiler, Yakında Bozulacak, Tükenmek Üzere, Alışveriş
// Listesi, Fiş Geçmişi, vb.) hepsi aynı boş-durum kartını (yuvarlak ikon +
// başlık + opsiyonel açıklama) ayrı ayrı kopyalıyordu — bazılarında açıklama
// vardı bazılarında yoktu, tutarsız bir izlenim veriyordu. Tek bileşen.
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}) {
  return (
    <View className="items-center justify-center mt-20 gap-3 px-6">
      <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
        <Ionicons name={icon} size={36} color="#047857" />
      </View>
      <Text className="text-ink dark:text-white font-semibold text-base text-center">{title}</Text>
      {description ? (
        <Text className="text-ink-muted dark:text-slate-400 text-center">{description}</Text>
      ) : null}
    </View>
  );
}
