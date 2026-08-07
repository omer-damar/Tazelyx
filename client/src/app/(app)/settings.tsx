import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useThemePreference, type ThemePreference } from "@/context/ThemeContext";
import { ApiError, deleteAccount } from "@/lib/api";

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "system", label: "Sistem", icon: "phone-portrait-outline" },
  { value: "light", label: "Açık", icon: "sunny-outline" },
  { value: "dark", label: "Koyu", icon: "moon-outline" },
];

export default function SettingsScreen() {
  const { preference, setPreference } = useThemePreference();
  const { token, signOut } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  function handleSignOut() {
    Alert.alert("Çıkış yap", "Hesabından çıkmak istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Çıkış yap",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert(
      "Hesabını sil",
      "Bu işlem geri alınamaz. Hesabın, kilerindeki tüm ürünler, tüketim geçmişin ve fiş kayıtların KALICI olarak silinecek.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Devam et",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Son bir kez soruyoruz",
              "Gerçekten hesabını ve tüm verilerini kalıcı olarak silmek istiyor musun?",
              [
                { text: "Vazgeç", style: "cancel" },
                {
                  text: "Hesabımı sil",
                  style: "destructive",
                  onPress: confirmDeleteAccount,
                },
              ]
            );
          },
        },
      ]
    );
  }

  async function confirmDeleteAccount() {
    if (!token) return;
    setIsDeleting(true);
    try {
      await deleteAccount(token);
      await signOut();
      router.replace("/(auth)/login");
    } catch (error) {
      setIsDeleting(false);
      Alert.alert(
        "Hesap silinemedi",
        error instanceof ApiError ? error.message : "Beklenmeyen bir hata oluştu."
      );
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-surface dark:bg-[#0B1220]">
      <View className="px-4 pt-4">
        <Text className="text-ink-muted dark:text-slate-400 text-xs font-semibold uppercase mb-2">
          Görünüm
        </Text>

        <View className="bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 overflow-hidden">
          {OPTIONS.map((option, index) => (
            <Pressable
              key={option.value}
              onPress={() => setPreference(option.value)}
              className={`flex-row items-center px-4 py-3.5 active:opacity-70 ${
                index > 0 ? "border-t border-slate-100 dark:border-white/10" : ""
              }`}>
              <Ionicons name={option.icon} size={20} color="#6E7A8D" />
              <Text className="flex-1 ml-3 text-ink dark:text-white text-base">{option.label}</Text>
              {preference === option.value ? (
                <Ionicons name="checkmark-circle" size={22} color="#047857" />
              ) : null}
            </Pressable>
          ))}
        </View>

        <Text className="text-ink-muted dark:text-slate-400 text-xs mt-3 px-1">
          "Sistem" seçiliyken uygulama, telefonunun Ayarlar &gt; Görünüm ayarına göre otomatik
          açık/koyu temaya geçer.
        </Text>

        <Text className="text-ink-muted dark:text-slate-400 text-xs font-semibold uppercase mb-2 mt-8">
          Hesap
        </Text>

        <View className="bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 overflow-hidden">
          <Pressable
            onPress={handleSignOut}
            className="flex-row items-center px-4 py-3.5 active:opacity-70">
            <Ionicons name="log-out-outline" size={20} color="#6E7A8D" />
            <Text className="flex-1 ml-3 text-ink dark:text-white text-base">Çıkış Yap</Text>
          </Pressable>
        </View>

        <Text className="text-ink-muted dark:text-slate-400 text-xs font-semibold uppercase mb-2 mt-8">
          Tehlikeli Alan
        </Text>

        <Pressable
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          className="bg-white dark:bg-[#151F2E] rounded-2xl border border-red-200 dark:border-red-500/20 flex-row items-center px-4 py-3.5 active:opacity-70 disabled:opacity-60">
          {isDeleting ? (
            <ActivityIndicator color="#EF5A5A" />
          ) : (
            <Ionicons name="trash-outline" size={20} color="#EF5A5A" />
          )}
          <Text className="flex-1 ml-3 text-base font-medium" style={{ color: "#EF5A5A" }}>
            Hesabımı Sil
          </Text>
        </Pressable>
        <Text className="text-ink-muted dark:text-slate-400 text-xs mt-3 px-1">
          Hesabın ve kilerindeki tüm veriler kalıcı olarak silinir, bu işlem geri alınamaz.
        </Text>
      </View>
    </SafeAreaView>
  );
}
