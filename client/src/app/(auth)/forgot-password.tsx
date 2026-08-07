import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { AuthBackground } from "@/components/AuthBackground";
import { ApiError, requestPasswordReset } from "@/lib/api";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setStatusMessage(null);

    if (!email) {
      setStatusMessage("E-posta gerekli.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { message } = await requestPasswordReset(email.trim());
      setStatusMessage(message);
    } catch (error) {
      setStatusMessage(
        error instanceof ApiError ? error.message : "İstek sırasında bir hata oluştu."
      );
    } finally {
      setIsSubmitting(false);
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
          Şifreni sıfırla
        </Text>
        <Text className="text-slate-600 text-center leading-6">
          Hesabına kayıtlı e-posta adresini gir, sana bir sıfırlama bağlantısı gönderelim.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          placeholderTextColor="#7c9189"
          autoCapitalize="none"
          keyboardType="email-address"
          className="border border-white/40 rounded-xl px-4 text-base text-slate-900 bg-white/30"
          style={{ height: 56, paddingVertical: 0 }}
        />

        {statusMessage ? (
          <Text className="text-slate-700 text-center text-sm">{statusMessage}</Text>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80 disabled:opacity-60">
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-base font-semibold">
              Sıfırlama Bağlantısı Gönder
            </Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.replace("/(auth)/login")} className="rounded-xl py-4 items-center">
          <Text className="text-slate-500">Girişe dön</Text>
        </Pressable>
      </View>
    </AuthBackground>
  );
}
