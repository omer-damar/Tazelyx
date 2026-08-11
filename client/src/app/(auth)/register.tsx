import { Image } from "expo-image";
import { Link, router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { AuthBackground } from "@/components/AuthBackground";
import { ApiError, registerUser } from "@/lib/api";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  async function handleRegister() {
    setErrorMessage(null);

    // Önceden sadece "!email || !password" kontrol ediliyordu — e-posta
    // formatı, şifre uzunluğu ve isim boşluğu hiç doğrulanmıyordu; kullanıcı
    // bu kuralları (özellikle "en az 8 karakter" — zaten placeholder'da
    // yazıyordu) ancak sunucudan dönen hatayla öğreniyordu.
    if (!name.trim()) {
      setErrorMessage("Ad Soyad gerekli.");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setErrorMessage("Geçerli bir e-posta adresi gir.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Şifre en az 8 karakter olmalı.");
      return;
    }

    setIsSubmitting(true);
    try {
      await registerUser(email.trim(), password, name.trim());
      router.replace({ pathname: "/(auth)/verify-pending", params: { email: email.trim() } });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : "Kayıt sırasında bir hata oluştu.");
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
              style={{ width: 300, height: 96 }}
              contentFit="contain"
            />
            <Text className="text-slate-600 mt-3 text-base">Hesap oluştur</Text>
          </View>

          <View className="gap-3">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ad Soyad"
              placeholderTextColor="#7c9189"
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailInputRef.current?.focus()}
              accessibilityLabel="Ad Soyad"
              className="border border-white/40 rounded-xl px-4 text-base text-slate-900 bg-white/30"
              style={{ height: 56, paddingVertical: 0 }}
            />
            <TextInput
              ref={emailInputRef}
              value={email}
              onChangeText={setEmail}
              placeholder="E-posta"
              placeholderTextColor="#7c9189"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              accessibilityLabel="E-posta"
              className="border border-white/40 rounded-xl px-4 text-base text-slate-900 bg-white/30"
              style={{ height: 56, paddingVertical: 0 }}
            />
            <TextInput
              ref={passwordInputRef}
              value={password}
              onChangeText={setPassword}
              placeholder="Şifre (en az 8 karakter)"
              placeholderTextColor="#7c9189"
              secureTextEntry
              textContentType="newPassword"
              autoComplete="password-new"
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              accessibilityLabel="Şifre, en az 8 karakter"
              className="border border-white/40 rounded-xl px-4 text-base text-slate-900 bg-white/30"
              style={{ height: 56, paddingVertical: 0 }}
            />
          </View>

          {errorMessage ? (
            <Text className="text-red-600 dark:text-red-400 text-sm text-center">{errorMessage}</Text>
          ) : null}

          <Pressable
            onPress={handleRegister}
            disabled={isSubmitting}
            className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80 disabled:opacity-60">
            {isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-base font-semibold">Kayıt Ol</Text>
            )}
          </Pressable>

          <View className="flex-row justify-center gap-1 mt-2">
            <Text className="text-slate-500">Zaten hesabın var mı?</Text>
            <Link href="/(auth)/login" className="text-brand-teal font-semibold">
              Giriş yap
            </Link>
          </View>
        </View>
    </AuthBackground>
  );
}
