import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ScreenState } from "@/components/ScreenState";
import { useAuth } from "@/context/AuthContext";
import { ApiError, getUploadHistory, type UploadedReceiptRecord } from "@/lib/api";
import { useDelayedLoading } from "@/lib/useDelayedLoading";

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UploadHistoryScreen() {
  const { token } = useAuth();
  const [receipts, setReceipts] = useState<UploadedReceiptRecord[]>([]);
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
        const { receipts: fetched } = await getUploadHistory(token);
        setReceipts(fetched);
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : "Fiş geçmişi yüklenirken bir hata oluştu."
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
          data={receipts}
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
              icon="time-outline"
              title="Henüz fiş yüklenmemiş"
              description="Bir fiş taradığında burada listelenecek."
            />
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 px-4 py-3 mb-3">
              <View className="w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center mr-3">
                <Ionicons name="receipt-outline" size={16} color="#047857" />
              </View>
              <View className="flex-1">
                <Text className="text-ink dark:text-white font-semibold text-sm" numberOfLines={1}>
                  {item.originalFilename || "Fiş"}
                </Text>
                <Text className="text-ink-muted dark:text-slate-400 text-xs mt-0.5">
                  {formatDateTime(item.createdAt)}
                </Text>
              </View>
            </View>
          )}
        />
      </ScreenState>
    </SafeAreaView>
  );
}
