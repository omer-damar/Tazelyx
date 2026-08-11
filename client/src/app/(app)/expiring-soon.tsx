import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ExpireBadge } from "@/components/ExpireBadge";
import { ScreenState } from "@/components/ScreenState";
import { useAuth } from "@/context/AuthContext";
import { ApiError, getExpiringSoonProducts, type Product } from "@/lib/api";
import { useDelayedLoading } from "@/lib/useDelayedLoading";

export default function ExpiringSoonScreen() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!token) return;
      if (!options.silent) setIsLoading(true);
      setErrorMessage(null);
      try {
        const { products: fetched } = await getExpiringSoonProducts(token);
        setProducts(fetched);
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : "Ürünler yüklenirken bir hata oluştu."
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

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-surface dark:bg-[#0B1220]">
      <ScreenState
        isLoading={isLoading}
        showSpinner={showSpinner}
        errorMessage={errorMessage}
        onRetry={load}>
        <FlatList
          data={products}
          keyExtractor={(item) => item._id}
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
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle-outline"
              title="Yakında bozulacak ürün yok"
              description="Kilerindeki hiçbir ürünün son kullanma tarihi yaklaşmıyor."
            />
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center justify-between bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100 dark:border-white/10 px-4 py-3 mb-3">
              <View className="flex-1 pr-3">
                <Text className="text-ink dark:text-white font-semibold text-base capitalize">
                  {item.name}
                </Text>
                <Text className="text-ink-muted dark:text-slate-400 text-sm mt-0.5">
                  {item.quantity} {item.unit}
                </Text>
              </View>
              <ExpireBadge effectiveExpireDate={item.effectiveExpireDate} />
            </View>
          )}
        />
      </ScreenState>
    </SafeAreaView>
  );
}
