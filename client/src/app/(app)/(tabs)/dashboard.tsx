import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { LyxMascot } from "@/components/LyxMascot";
import { DefaultTabHeaderRight } from "@/components/TabHeaderActions";
import { useAuth } from "@/context/AuthContext";
import { useWasteScore } from "@/context/WasteScoreContext";
import { ApiError, getDashboardSummary, getRunningLowProducts, type DashboardSummary } from "@/lib/api";
import { useDelayedLoading } from "@/lib/useDelayedLoading";
import { PANEL_MOOD_IMAGES } from "@/lib/lyxMoodImages";
import { syncRunningLowNotifications } from "@/lib/notifications";

type IconName = keyof typeof Ionicons.glyphMap;

function StatTile({
  icon,
  label,
  value,
  color,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: number;
  color: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 p-4 flex-1 min-w-[45%] overflow-hidden active:opacity-70"
      style={{
        shadowColor: "#0C1624",
        shadowOpacity: 0.05,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
      }}>
      <View className="flex-row items-start justify-between mb-2">
        <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: `${color}1A` }}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={16} color="#cbd5e1" /> : null}
      </View>
      <Text style={{ color }} className="text-3xl font-bold">
        {value}
      </Text>
      <Text className="text-ink-muted dark:text-slate-400 text-sm mt-1">{label}</Text>
      <View className="absolute left-0 right-0 bottom-0 h-1" style={{ backgroundColor: color }} />
    </Pressable>
  );
}

export default function DashboardScreen() {
  const { token } = useAuth();
  const { score: wasteScore } = useWasteScore();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (!silent) setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await getDashboardSummary(token);
        setSummary(data);
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : "Panel verisi yüklenirken bir hata oluştu."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }

      // Tükenmek Üzere bildirimleri yalnızca o alt ekrana girildiğinde
      // kurulursa, kullanıcı o ekranı hiç açmadığı sürece bildirim hiç
      // kurulmaz. Panel çok daha sık ziyaret edildiği için senkron burada da
      // çalıştırılır (running-low.tsx'teki senkron da duruyor, zararsız bir
      // tekrar). Ayrı try/catch: bu başarısız olursa Panel'in kendi
      // verisini/hata mesajını etkilemez.
      try {
        const { products: runningLow } = await getRunningLowProducts(token);
        syncRunningLowNotifications(runningLow);
      } catch {
        // Sessizce yut — bildirim senkronu, ekranın asıl işlevi değil.
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      load(!!summary);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  return (
    <>
      <AppHeader
        title="Panel"
        left={<LyxMascot moodImages={PANEL_MOOD_IMAGES} score={wasteScore} />}
        right={<DefaultTabHeaderRight />}
      />
      <SafeAreaView edges={["bottom"]} className="flex-1 bg-surface dark:bg-[#0B1220]">
      {isLoading ? (
        showSpinner ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#047857" />
          </View>
        ) : null
      ) : errorMessage ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-ink-muted dark:text-slate-400 text-center">{errorMessage}</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                load(true);
              }}
              tintColor="#047857"
            />
          }>
          <Text className="text-ink dark:text-white text-lg font-semibold">
            Bugünkü mutfak özeti
          </Text>
          <Text className="text-ink-muted dark:text-slate-400 text-sm mb-4">
            Kilerinin genel durumu, tek bakışta.
          </Text>

          <View className="flex-row flex-wrap gap-3">
            <StatTile
              icon="file-tray-stacked-outline"
              label="Toplam Ürün"
              value={summary?.totalProducts ?? 0}
              color="#047857"
              onPress={() => router.navigate("/(app)/(tabs)")}
            />
            <StatTile
              icon="alarm-outline"
              label="Yakında Bozulacak"
              value={summary?.expiringSoon ?? 0}
              color="#D97706"
              onPress={() => router.push("/(app)/expiring-soon")}
            />
            <StatTile
              icon="create-outline"
              label="Manuel Tarihli"
              value={summary?.manualExpire ?? 0}
              color="#14b8a6"
              onPress={() => router.push({ pathname: "/(app)/product-list", params: { filter: "manual" } })}
            />
            <StatTile
              icon="calendar-outline"
              label="Tahmini Tarihli"
              value={summary?.estimatedExpire ?? 0}
              color="#64748b"
              onPress={() =>
                router.push({ pathname: "/(app)/product-list", params: { filter: "estimated" } })
              }
            />
            <StatTile
              icon="cart-outline"
              label="Tükenmek Üzere"
              value={summary?.runningLow ?? 0}
              color="#6366f1"
              onPress={() => router.push("/(app)/running-low")}
            />
          </View>
        </ScrollView>
      )}
      </SafeAreaView>
    </>
  );
}
