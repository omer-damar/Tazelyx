import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/context/AuthContext";
import { ApiError, createProduct } from "@/lib/api";

const UNITS = ["kg", "lt", "adet"] as const;

export default function AddProductScreen() {
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("adet");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);

    const parsedQuantity = Number(quantity.replace(",", "."));

    if (!name.trim()) {
      setErrorMessage("Ürün adı gerekli.");
      return;
    }

    if (!quantity || Number.isNaN(parsedQuantity) || parsedQuantity < 0) {
      setErrorMessage("Geçerli bir miktar gir.");
      return;
    }

    if (!token) return;

    setIsSubmitting(true);
    try {
      await createProduct(token, { name: name.trim(), quantity: parsedQuantity, unit });
      router.back();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Ürün eklenirken bir hata oluştu."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-white dark:bg-[#0B1220] px-6 pt-6">
      <View className="gap-4">
        <View>
          <Text className="text-ink-muted dark:text-slate-400 mb-1 text-sm">Ürün adı</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="ör. Süt"
            placeholderTextColor="#94a3b8"
            accessibilityLabel="Ürün adı"
            className="border border-slate-200 dark:border-white/10 rounded-xl px-4 text-base text-ink dark:text-white bg-slate-50 dark:bg-white/5"
            style={{ height: 52, paddingVertical: 0 }}
          />
        </View>

        <View>
          <Text className="text-ink-muted dark:text-slate-400 mb-1 text-sm">Miktar</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="ör. 1.5"
            placeholderTextColor="#94a3b8"
            keyboardType="decimal-pad"
            accessibilityLabel="Miktar"
            className="border border-slate-200 dark:border-white/10 rounded-xl px-4 text-base text-ink dark:text-white bg-slate-50 dark:bg-white/5"
            style={{ height: 52, paddingVertical: 0 }}
          />
        </View>

        <View>
          <Text className="text-ink-muted dark:text-slate-400 mb-1 text-sm">Birim</Text>
          <View className="flex-row gap-2">
            {UNITS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setUnit(option)}
                accessibilityRole="radio"
                accessibilityLabel={option}
                accessibilityState={{ checked: unit === option }}
                className={`flex-1 items-center py-3 rounded-xl border ${
                  unit === option
                    ? "bg-brand-green border-brand-green"
                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
                }`}>
                <Text
                  className={
                    unit === option
                      ? "text-white font-semibold"
                      : "text-ink-muted dark:text-slate-300"
                  }>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {errorMessage ? (
          <Text className="text-red-600 dark:text-red-400 text-sm text-center">{errorMessage}</Text>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Ürünü ekle"
          accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80 disabled:opacity-60">
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-base font-semibold">Ekle</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
