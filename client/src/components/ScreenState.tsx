import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

// Neredeyse her liste ekranı aynı üç durumlu merdiveni (yükleniyor / hata /
// içerik) ayrı ayrı yazıyordu — bu yüzden "Tekrar dene" butonu bazı
// ekranlarda vardı bazılarında unutulmuştu (bkz. AUDIT_FRONTEND.md UX-L2).
// Tek bileşende toplayınca hem ~200 satırlık tekrar kalkıyor hem de retry
// davranışı her ekranda tutarlı oluyor.
export function ScreenState({
  isLoading,
  showSpinner,
  errorMessage,
  onRetry,
  children,
}: {
  isLoading: boolean;
  showSpinner: boolean;
  errorMessage: string | null;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading) {
    return showSpinner ? (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#047857" />
      </View>
    ) : null;
  }

  if (errorMessage) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <Text className="text-ink-muted dark:text-slate-400 text-center">{errorMessage}</Text>
        {onRetry ? (
          <Pressable onPress={onRetry} className="active:opacity-70">
            <Text className="text-brand-green font-semibold">Tekrar dene</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return <>{children}</>;
}
