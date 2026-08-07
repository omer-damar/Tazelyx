import { Stack } from "expo-router";

import { useThemePreference } from "@/context/ThemeContext";

// Sekmeli ana gövde ("(tabs)") + üzerine modal olarak açılan "ürün ekle"
// formu. Modal, sekme çubuğunun üzerine kayarak gelsin diye ayrı bir Stack
// route'u olarak tanımlı (standart expo-router "tabs + modal" deseni).
export default function AppLayout() {
  const { resolvedScheme } = useThemePreference();
  // native-stack'in ekran kapsayıcısının arka planı içerik View'ından ayrı
  // bir katmandır — elle koyu/açık ayarlanmazsa geçiş animasyonu sırasında
  // bir anlığına varsayılan açık renk görünür ("göz kırpması"). `contentStyle`
  // ile bu dış katman da doğru renge sabitlenir.
  const backgroundColor = resolvedScheme === "dark" ? "#0B1220" : "#F4F7F8";

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor },
      }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-product" options={{ presentation: "modal", headerShown: true, title: "Ürün Ekle" }} />
      <Stack.Screen name="edit-product" options={{ presentation: "modal", headerShown: true, title: "Ürünü Düzenle" }} />
      <Stack.Screen name="expiring-soon" options={{ headerShown: true, title: "Yakında Bozulacak" }} />
      <Stack.Screen name="product-list" options={{ headerShown: true, title: "Ürünler" }} />
      <Stack.Screen name="upload-history" options={{ headerShown: true, title: "Fiş Geçmişi" }} />
      <Stack.Screen name="settings" options={{ headerShown: true, title: "Ayarlar" }} />
      <Stack.Screen name="score" options={{ headerShown: true, title: "İsraf Skoru" }} />
      <Stack.Screen name="running-low" options={{ headerShown: true, title: "Tükenmek Üzere" }} />
      <Stack.Screen name="shopping-list" options={{ headerShown: true, title: "Alışveriş Listesi" }} />
    </Stack>
  );
}
