import { Image } from "expo-image";
import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { AuthBackground } from "@/components/AuthBackground";
import { useAuth } from "@/context/AuthContext";
import { ApiError, loginUser } from "@/lib/api";

export default function LoginScreen() {
  const { signIn, sessionExpiredMessage, clearSessionExpiredMessage } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bu ekrandan ayrılınca (başarılı girişten sonra ya da kayıt/şifremi
  // unuttum'a geçilince) mesajı temizle — sonraki normal ziyaretlerde
  // tekrar görünmesin.
  useEffect(() => {
    return () => clearSessionExpiredMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin() {
    setErrorMessage(null);
    setNeedsVerification(false);

    if (!email || !password) {
      setErrorMessage("E-posta ve şifre gerekli.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token, user } = await loginUser(email.trim(), password);
      await signIn(token, user);
      router.replace("/(app)/(tabs)");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setNeedsVerification(true);
        setErrorMessage(error.message);
      } else {
        setErrorMessage(error instanceof ApiError ? error.message : "Giriş sırasında bir hata oluştu.");
      }
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
            <Text className="text-slate-600 mt-3 text-base">Tazelyx'e hoşgeldin!</Text>
          </View>

          {sessionExpiredMessage ? (
            <View className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Text className="text-amber-700 text-sm text-center">{sessionExpiredMessage}</Text>
            </View>
          ) : null}

          <View className="gap-3">
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
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Şifre"
              placeholderTextColor="#7c9189"
              secureTextEntry
              className="border border-white/40 rounded-xl px-4 text-base text-slate-900 bg-white/30"
              style={{ height: 56, paddingVertical: 0 }}
            />
          </View>

          {errorMessage ? (
            <Text className="text-red-600 dark:text-red-400 text-sm text-center">{errorMessage}</Text>
          ) : null}

          {needsVerification ? (
            <Pressable
              onPress={() =>
                router.push({ pathname: "/(auth)/verify-pending", params: { email: email.trim() } })
              }>
              <Text className="text-brand-teal text-center font-semibold">
                Onay e-postasını tekrar gönder
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleLogin}
            disabled={isSubmitting}
            className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80 disabled:opacity-60">
            {isSubmitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-base font-semibold">Giriş Yap</Text>
            )}
          </Pressable>

          <Link href="/(auth)/forgot-password" className="text-brand-teal text-center">
            Şifremi unuttum
          </Link>

          <View className="flex-row justify-center gap-1 mt-4">
            <Text className="text-slate-500">Hesabın yok mu?</Text>
            <Link href="/(auth)/register" className="text-brand-teal font-semibold">
              Kayıt ol
            </Link>
          </View>
        </View>
    </AuthBackground>
  );
}
