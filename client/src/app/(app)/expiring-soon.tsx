import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ExpireBadge } from "@/components/ExpireBadge";
import { useAuth } from "@/context/AuthContext";
import { ApiError, getExpiringSoonProducts, type Product } from "@/lib/api";
import { useDelayedLoading } from "@/lib/useDelayedLoading";

export default function ExpiringSoonScreen() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const { products: fetched } = await getExpiringSoonProducts(token);
        setProducts(fetched);
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : "Ürünler yüklenirken bir hata oluştu."
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [token]);

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-slate-50 dark:bg-[#0B1220]">
      {isLoading ? (
        showSpinner ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#047857" />
          </View>
        ) : null
      ) : errorMessage ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-slate-500 dark:text-slate-400 text-center">{errorMessage}</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20 gap-3 px-6">
              <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
                <Ionicons name="checkmark-circle-outline" size={36} color="#047857" />
              </View>
              <Text className="text-slate-900 dark:text-white font-semibold text-base">
                Yakında bozulacak ürün yok
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-center">
                Kilerindeki hiçbir ürünün son kullanma tarihi yaklaşmıyor.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center justify-between bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100 dark:border-white/10 px-4 py-3 mb-3">
              <View className="flex-1 pr-3">
                <Text className="text-slate-900 dark:text-white font-semibold text-base capitalize">
                  {item.name}
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                  {item.quantity} {item.unit}
                </Text>
              </View>
              <ExpireBadge effectiveExpireDate={item.effectiveExpireDate} />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
