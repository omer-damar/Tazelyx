import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ScreenState } from "@/components/ScreenState";
import { useAuth } from "@/context/AuthContext";
import { useThemePreference } from "@/context/ThemeContext";
import {
  addShoppingListItem,
  ApiError,
  getRunningLowProducts,
  type RunningLowProduct,
} from "@/lib/api";
import { syncRunningLowNotifications } from "@/lib/notifications";
import { useDelayedLoading } from "@/lib/useDelayedLoading";

function formatDaysRemaining(days: number) {
  if (days <= 0) return "Bugün-yarın tükenebilir";
  return `~${days} gün içinde tükenebilir`;
}

export default function RunningLowScreen() {
  const { token } = useAuth();
  const { resolvedScheme } = useThemePreference();
  const isDark = resolvedScheme === "dark";
  const [products, setProducts] = useState<RunningLowProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!token) return;
      if (!options.silent) setIsLoading(true);
      setErrorMessage(null);
      try {
        const { products: fetched } = await getRunningLowProducts(token);
        setProducts(fetched);
        syncRunningLowNotifications(fetched).catch((error) =>
          console.warn("Tükenmek üzere bildirimleri senkronize edilemedi:", error)
        );
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : "Tahminler yüklenirken bir hata oluştu."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Alışveriş listesine eklenince kalem bu ekrandan (Tükenmek Üzere) kaldırılır
  // — yalnızca bir "Eklendi" rozeti gösterip kalemi listede bırakmak, eklemenin
  // işe yaramadığı izlenimini verir. Kaybolması "bunu zaten hallettim" hissini
  // doğru verir; ürün gerçekten tükenip yeniden stoklanmadıkça bir dahaki
  // ziyarette (tahmin hâlâ geçerliyse) yine listelenir — çünkü listeye eklemek
  // tek başına sorunu çözmez, kilerdeki miktarı artırmaz.
  async function handleAddToList(product: RunningLowProduct) {
    if (!token) return;
    setAddingId(product.productId);
    try {
      await addShoppingListItem(token, {
        name: product.name,
        unit: product.unit,
        source: "prediction",
      });
      setProducts((current) => current.filter((p) => p.productId !== product.productId));
    } catch (error) {
      Alert.alert(
        "Eklenemedi",
        error instanceof ApiError
          ? error.message
          : `"${product.name}" alışveriş listesine eklenirken bir hata oluştu.`
      );
    } finally {
      setAddingId(null);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-surface dark:bg-[#0B1220]">
      <Pressable
        onPress={() => router.push("/(app)/shopping-list")}
        accessibilityRole="button"
        accessibilityLabel="Alışveriş listeni gör"
        className="flex-row items-center justify-between bg-white dark:bg-[#151F2E] border border-slate-100 dark:border-white/10 mx-4 mt-4 px-4 py-3 rounded-2xl active:opacity-70">
        <View className="flex-row items-center">
          <Ionicons name="cart-outline" size={18} color="#6366f1" />
          <Text className="ml-2 text-ink dark:text-white font-medium text-sm">
            Alışveriş Listeni Gör
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={isDark ? "#cbd5e1" : "#64748b"} />
      </Pressable>
      <ScreenState
        isLoading={isLoading}
        showSpinner={showSpinner}
        errorMessage={errorMessage}
        onRetry={load}>
        <FlatList
          data={products}
          keyExtractor={(item) => item.productId}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                load({ silent: true });
              }}
              tintColor="#047857"
            />
          }
          ListHeaderComponent={
            products.length > 0 ? (
              <Text className="text-ink-muted dark:text-slate-400 text-sm mb-3">
                Geçmiş tüketim hızına göre bu ürünlerin yakında tükeneceğini tahmin ediyoruz.
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle-outline"
              title="Tükenmek üzere ürün yok"
              description="Yeterli tüketim geçmişi biriktikçe, tükenmek üzere olan ürünler burada görünecek."
            />
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center justify-between bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100 dark:border-white/10 px-4 py-3 mb-3">
              <View className="flex-1 pr-3">
                <Text className="text-ink dark:text-white font-semibold text-base capitalize">
                  {item.name}
                </Text>
                <Text className="text-ink-muted dark:text-slate-400 text-sm mt-0.5">
                  {item.quantity} {item.unit} kaldı · {formatDaysRemaining(item.predictedDaysRemaining)}
                </Text>
              </View>
              <Pressable
                onPress={() => handleAddToList(item)}
                disabled={addingId === item.productId}
                accessibilityRole="button"
                accessibilityLabel={`${item.name} ürününü alışveriş listesine ekle`}
                className="flex-row items-center px-3 py-2 rounded-xl bg-brand-green active:opacity-70 disabled:opacity-60">
                {addingId === item.productId ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="cart-outline" size={16} color="white" />
                )}
                <Text className="ml-1.5 text-xs font-semibold text-white">Ekle</Text>
              </Pressable>
            </View>
          )}
        />
      </ScreenState>
    </SafeAreaView>
  );
}
