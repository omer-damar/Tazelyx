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
import { useThemePreference } from "@/context/ThemeContext";
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
  isDark,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: number;
  color: string;
  isDark: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${label}: ${value}`}
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
        {/* #cbd5e1 açık modda beyaz kart üzerinde ~1.5:1 kontrastla neredeyse
            görünmezdi — sadece koyu modda kullanılıyor, açık modda daha
            koyu bir gri (#64748b) devreye giriyor. */}
        {onPress ? (
          <Ionicons name="chevron-forward" size={16} color={isDark ? "#cbd5e1" : "#64748b"} />
        ) : null}
      </View>
      <Text style={{ color }} className="text-3xl font-bold">
        {value}
      </Text>
      <Text className="text-ink-muted dark:text-slate-400 text-sm mt-1">{label}</Text>
      <View className="absolute left-0 right-0 bottom-0 h-1" style={{ backgroundColor: color }} />
    </Pressable>
  );
}

// Her kutunun kendi rengi vardı ama karanlık modda dallanmıyordu — marka
// yeşili (#047857) koyu bir kart üzerinde ~2.4:1 kontrastla zar zor
// okunuyordu. Karanlık modda her biri için daha açık bir ton kullanılıyor.
const TILE_COLORS = {
  total: { light: "#047857", dark: "#34C28E" },
  expiringSoon: { light: "#D97706", dark: "#F0A84E" },
  manual: { light: "#14b8a6", dark: "#2DD4BF" },
  estimated: { light: "#64748b", dark: "#94A3B8" },
  runningLow: { light: "#6366f1", dark: "#818CF8" },
};

export default function DashboardScreen() {
  const { token } = useAuth();
  const { resolvedScheme } = useThemePreference();
  const isDark = resolvedScheme === "dark";
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
        syncRunningLowNotifications(runningLow).catch((error) =>
          console.warn("Tükenmek üzere bildirimleri senkronize edilemedi:", error)
        );
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
              color={isDark ? TILE_COLORS.total.dark : TILE_COLORS.total.light}
              isDark={isDark}
              onPress={() => router.navigate("/(app)/(tabs)")}
            />
            <StatTile
              icon="alarm-outline"
              label="Yakında Bozulacak"
              value={summary?.expiringSoon ?? 0}
              color={isDark ? TILE_COLORS.expiringSoon.dark : TILE_COLORS.expiringSoon.light}
              isDark={isDark}
              onPress={() => router.push("/(app)/expiring-soon")}
            />
            <StatTile
              icon="create-outline"
              label="Manuel Tarihli"
              value={summary?.manualExpire ?? 0}
              color={isDark ? TILE_COLORS.manual.dark : TILE_COLORS.manual.light}
              isDark={isDark}
              onPress={() => router.push({ pathname: "/(app)/product-list", params: { filter: "manual" } })}
            />
            <StatTile
              icon="calendar-outline"
              label="Tahmini Tarihli"
              value={summary?.estimatedExpire ?? 0}
              color={isDark ? TILE_COLORS.estimated.dark : TILE_COLORS.estimated.light}
              isDark={isDark}
              onPress={() =>
                router.push({ pathname: "/(app)/product-list", params: { filter: "estimated" } })
              }
            />
            <StatTile
              icon="cart-outline"
              label="Tükenmek Üzere"
              value={summary?.runningLow ?? 0}
              color={isDark ? TILE_COLORS.runningLow.dark : TILE_COLORS.runningLow.light}
              isDark={isDark}
              onPress={() => router.push("/(app)/running-low")}
            />
          </View>
        </ScrollView>
      )}
      </SafeAreaView>
    </>
  );
}
