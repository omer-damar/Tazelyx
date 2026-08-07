import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { AuthBackground } from "@/components/AuthBackground";
import { ApiError, resendVerificationEmail } from "@/lib/api";

export default function VerifyPendingScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function handleResend() {
    if (!email) return;

    setStatusMessage(null);
    setIsSending(true);
    try {
      const { message } = await resendVerificationEmail(email);
      setStatusMessage(message);
    } catch (error) {
      setStatusMessage(
        error instanceof ApiError ? error.message : "E-posta gönderilirken bir hata oluştu."
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AuthBackground>
      <View className="gap-4">
        <View className="items-center mb-2">
          <Image
            source={require("@/assets/images/tazelyx-logo.png")}
            style={{ width: 260, height: 84 }}
            contentFit="contain"
          />
        </View>

        <Text className="text-xl font-semibold text-center text-slate-900">
          E-postanı onayla
        </Text>
        <Text className="text-slate-600 text-center leading-6">
          {email ? `${email} adresine` : "E-posta adresine"} bir onay bağlantısı gönderdik.
          Devam etmek için gelen kutunu (ve gerekirse spam klasörünü) kontrol et.
        </Text>

        {statusMessage ? (
          <Text className="text-brand-teal text-center text-sm">{statusMessage}</Text>
        ) : null}

        <Pressable
          onPress={handleResend}
          disabled={isSending || !email}
          className="border border-brand-green rounded-xl py-4 items-center mt-2 active:opacity-70 disabled:opacity-50">
          {isSending ? (
            <ActivityIndicator color="#047857" />
          ) : (
            <Text className="text-brand-green text-base font-semibold">
              Onay e-postasını tekrar gönder
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(auth)/login")}
          className="rounded-xl py-4 items-center">
          <Text className="text-slate-500">Girişe dön</Text>
        </Pressable>
      </View>
    </AuthBackground>
  );
}
