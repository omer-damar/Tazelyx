import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { AuthBackground } from "@/components/AuthBackground";
import { ApiError, resetPassword } from "@/lib/api";

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmInputRef = useRef<TextInput>(null);

  async function handleSubmit() {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!token) {
      setErrorMessage("Sıfırlama bağlantısı geçersiz. Lütfen e-postandaki bağlantıyı tekrar kullan.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Şifreler eşleşmiyor.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { message } = await resetPassword(token, newPassword);
      setSuccessMessage(message);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Şifre sıfırlanırken bir hata oluştu."
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
            Yeni şifreni belirle
          </Text>

          {successMessage ? (
            <>
              <Text className="text-slate-600 text-center leading-6">{successMessage}</Text>
              <Pressable
                onPress={() => router.replace("/(auth)/login")}
                className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80">
                <Text className="text-white text-base font-semibold">Girişe dön</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View className="gap-3">
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Yeni şifre (en az 8 karakter)"
                  placeholderTextColor="#7c9189"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmInputRef.current?.focus()}
                  accessibilityLabel="Yeni şifre, en az 8 karakter"
                  className="border border-white/40 rounded-xl px-4 text-base text-slate-900 bg-white/30"
                  style={{ height: 56, paddingVertical: 0 }}
                />
                <TextInput
                  ref={confirmInputRef}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Yeni şifre (tekrar)"
                  placeholderTextColor="#7c9189"
                  secureTextEntry
                  textContentType="newPassword"
                  autoComplete="password-new"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  accessibilityLabel="Yeni şifre tekrar"
                  className="border border-white/40 rounded-xl px-4 text-base text-slate-900 bg-white/30"
                  style={{ height: 56, paddingVertical: 0 }}
                />
              </View>

              {errorMessage ? (
                <Text className="text-red-600 dark:text-red-400 text-sm text-center">{errorMessage}</Text>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitting}
                className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80 disabled:opacity-60">
                {isSubmitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white text-base font-semibold">Şifreyi Güncelle</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => router.replace("/(auth)/login")}
                className="rounded-xl py-4 items-center">
                <Text className="text-slate-500">Girişe dön</Text>
              </Pressable>
            </>
          )}
        </View>
    </AuthBackground>
  );
}
