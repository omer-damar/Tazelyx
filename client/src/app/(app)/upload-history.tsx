import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const { receipts: fetched } = await getUploadHistory(token);
        setReceipts(fetched);
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : "Fiş geçmişi yüklenirken bir hata oluştu."
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [token]);

  return (
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
        <FlatList
          data={receipts}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20 gap-3 px-6">
              <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
                <Ionicons name="time-outline" size={36} color="#047857" />
              </View>
              <Text className="text-ink dark:text-white font-semibold text-base">
                Henüz fiş yüklenmemiş
              </Text>
              <Text className="text-ink-muted dark:text-slate-400 text-center">
                Bir fiş taradığında burada listelenecek.
              </Text>
            </View>
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
      )}
    </SafeAreaView>
  );
}
