import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useThemePreference, type ThemePreference } from "@/context/ThemeContext";
import { ApiError, deleteAccount, getProducts, getRunningLowProducts } from "@/lib/api";
import {
  getNotificationDebugSummary,
  scheduleTestNotification,
  syncExpiryNotifications,
  syncRunningLowNotifications,
} from "@/lib/notifications";

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "system", label: "Sistem", icon: "phone-portrait-outline" },
  { value: "light", label: "Açık", icon: "sunny-outline" },
  { value: "dark", label: "Koyu", icon: "moon-outline" },
];

export default function SettingsScreen() {
  const { preference, setPreference } = useThemePreference();
  const { token, signOut } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  // Geçici tanılama aracı: tükenmek üzere bildirimlerinin gerçek cihazda
  // neden ateşlenmediğini araştırırken eklendi. Bildirimler saatler sonra
  // tetiklendiği için normal akışta "kuruldu mu / ateşlendi mi" sorusunun
  // cevabını almak saatler sürüyordu — bu iki buton, aynı zamanlama
  // mekanizmasını (SchedulableTriggerInputTypes.DATE) kullanarak cevabı
  // dakikalar içine indiriyor.
  async function handleShowNotificationStatus() {
    try {
      const { permissionStatus, scheduled } = await getNotificationDebugSummary();
      const lines = scheduled.length
        ? scheduled
            .map((n) => `• [${n.type}] ${n.triggerSummary}\n  ${n.body}`)
            .join("\n\n")
        : "Kurulu bildirim yok.";
      Alert.alert(
        `İzin: ${permissionStatus} · Kurulu: ${scheduled.length}`,
        lines
      );
    } catch (error) {
      Alert.alert("Hata", error instanceof Error ? error.message : "Durum alınamadı.");
    }
  }

  async function handleSendTestNotification() {
    setIsSendingTest(true);
    try {
      const triggerDate = await scheduleTestNotification(10);
      Alert.alert(
        "Test bildirimi kuruldu",
        `${triggerDate.toLocaleTimeString("tr-TR")} civarında (10 sn sonra) gelmeli. Uygulamayı kapatıp bekleyebilirsin.`
      );
    } catch (error) {
      Alert.alert("Hata", error instanceof Error ? error.message : "Test bildirimi kurulamadı.");
    } finally {
      setIsSendingTest(false);
    }
  }

  // Kiler/Panel'deki senkron çağrıları "await" edilmeden (fire-and-forget)
  // tetiklendiği için bir hata olsa bile sadece console.warn'a düşüyor —
  // telefonun konsoluna canlı erişim olmadığı için o hata görünmez kalıyor.
  // Bu buton AYNI senkron fonksiyonlarını burada `await` ederek çağırıp
  // her adımın (veri çekme + iki senkron) sonucunu/hatasını doğrudan ekranda
  // gösteriyor — asıl "neden hiçbir şey kurulmuyor" sorusuna cevap bulmak için.
  async function handleForceSyncNow() {
    if (!token) return;
    setIsForceSyncing(true);
    const results: string[] = [];
    try {
      const [{ products: allProducts }, { products: runningLow }] = await Promise.all([
        getProducts(token),
        getRunningLowProducts(token),
      ]);
      results.push(`Kilerden ${allProducts.length} ürün, tahminden ${runningLow.length} ürün çekildi.`);

      try {
        await syncExpiryNotifications(allProducts);
        results.push("✓ SKT senkronu tamamlandı.");
      } catch (error) {
        results.push(`✗ SKT senkronu HATA verdi: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        await syncRunningLowNotifications(runningLow);
        results.push("✓ Tükenmek üzere senkronu tamamlandı.");
      } catch (error) {
        results.push(
          `✗ Tükenmek üzere senkronu HATA verdi: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const { scheduled } = await getNotificationDebugSummary();
      results.push(`Şu an kurulu bildirim sayısı: ${scheduled.length}`);
    } catch (error) {
      results.push(`✗ Veri çekilemedi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsForceSyncing(false);
      Alert.alert("Senkron sonucu", results.join("\n\n"));
    }
  }

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
          Bildirim Tanılama (geçici)
        </Text>

        <View className="bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 overflow-hidden">
          <Pressable
            onPress={handleShowNotificationStatus}
            className="flex-row items-center px-4 py-3.5 active:opacity-70">
            <Ionicons name="list-outline" size={20} color="#6E7A8D" />
            <Text className="flex-1 ml-3 text-ink dark:text-white text-base">
              Kurulu Bildirimleri Göster
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSendTestNotification}
            disabled={isSendingTest}
            className="flex-row items-center px-4 py-3.5 border-t border-slate-100 dark:border-white/10 active:opacity-70 disabled:opacity-60">
            {isSendingTest ? (
              <ActivityIndicator color="#6E7A8D" />
            ) : (
              <Ionicons name="notifications-outline" size={20} color="#6E7A8D" />
            )}
            <Text className="flex-1 ml-3 text-ink dark:text-white text-base">
              10 sn Sonra Test Bildirimi Gönder
            </Text>
          </Pressable>
          <Pressable
            onPress={handleForceSyncNow}
            disabled={isForceSyncing}
            className="flex-row items-center px-4 py-3.5 border-t border-slate-100 dark:border-white/10 active:opacity-70 disabled:opacity-60">
            {isForceSyncing ? (
              <ActivityIndicator color="#6E7A8D" />
            ) : (
              <Ionicons name="sync-outline" size={20} color="#6E7A8D" />
            )}
            <Text className="flex-1 ml-3 text-ink dark:text-white text-base">
              Şimdi Senkronize Et (Hatayı Göster)
            </Text>
          </Pressable>
        </View>
        <Text className="text-ink-muted dark:text-slate-400 text-xs mt-3 px-1">
          Tükenmek üzere bildirimindeki gecikmeyi araştırmak için eklendi, sorun çözülünce
          kaldırılacak.
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
