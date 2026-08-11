import { router } from "expo-router";
import { View } from "react-native";

import { HeaderIconButton } from "@/components/HeaderIconButton";

// Çıkış Yap burada ayrı bir ikon olarak sunulmaz — ayarlar ikonuna çok yakın
// olacağından yanlışlıkla basılabilir. Bunun yerine Ayarlar ekranı içinde
// (bkz. settings.tsx) bir buton olarak yer alır.
export function DefaultTabHeaderRight() {
  return (
    <View className="flex-row items-center">
      <HeaderIconButton
        icon="settings-outline"
        onPress={() => router.push("/(app)/settings")}
        accessibilityLabel="Ayarlar"
      />
    </View>
  );
}

export function UploadTabHeaderRight() {
  return (
    <View className="flex-row items-center">
      <HeaderIconButton
        icon="time-outline"
        onPress={() => router.push("/(app)/upload-history")}
        accessibilityLabel="Fiş geçmişi"
      />
      <HeaderIconButton
        icon="settings-outline"
        onPress={() => router.push("/(app)/settings")}
        accessibilityLabel="Ayarlar"
      />
    </View>
  );
}
