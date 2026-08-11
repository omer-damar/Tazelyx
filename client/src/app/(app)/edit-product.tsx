import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/context/AuthContext";
import { useThemePreference } from "@/context/ThemeContext";
import { useWasteScore } from "@/context/WasteScoreContext";
import { ApiError, deleteProduct, getProduct, updateProduct } from "@/lib/api";
import { useDelayedLoading } from "@/lib/useDelayedLoading";

const UNITS = ["kg", "lt", "adet"] as const;

function formatDate(date: Date) {
  return date.toLocaleDateString("tr-TR");
}

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const { resolvedScheme } = useThemePreference();
  const { refresh: refreshWasteScore } = useWasteScore();

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("adet");
  const [manualExpireDate, setManualExpireDate] = useState<Date | null>(null);
  const [expireDateSource, setExpireDateSource] = useState<"estimated" | "manual">("estimated");
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Yükleme hatası, kaydetme hatasından AYRI tutuluyor — biri "form asla
  // dolmadı, tekrar dene" demek, diğeri "form dolu, kaydederken bir sorun
  // oldu" demek. Önceden ikisi aynı state'i paylaştığı için yükleme
  // başarısız olduğunda kullanıcı boş/düzenlenebilir bir form görüyordu ve
  // "Kaydet"e basınca kileri çöp veriyle güncelleyebiliyordu.
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setIsLoading(true);
    setLoadErrorMessage(null);
    try {
      const { product } = await getProduct(token, id);
      setName(product.name);
      setQuantity(String(product.quantity));
      // `Product.unit` API tipinde düz `string` — backend hiçbir zaman
      // UNITS dışında bir değer döndürmemeli ama tip sistemi bunu garanti
      // etmiyor; beklenmedik bir değer sessizce hiçbir birim çipini seçili
      // göstermez ve kaydedince o beklenmedik değeri geri yazardı.
      setUnit(
        (UNITS as readonly string[]).includes(product.unit)
          ? (product.unit as (typeof UNITS)[number])
          : "adet"
      );
      setExpireDateSource(product.expireDateSource);
      setManualExpireDate(
        product.manualExpireDate ? new Date(product.manualExpireDate) : null
      );
    } catch (error) {
      setLoadErrorMessage(
        error instanceof ApiError ? error.message : "Ürün yüklenirken bir hata oluştu."
      );
    } finally {
      setIsLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    load();
  }, [load]);

  function bumpQuantity(direction: 1 | -1) {
    const step = unit === "adet" ? 1 : 0.1;
    const current = Number(quantity.replace(",", ".")) || 0;
    const next = Math.max(0, current + direction * step);
    setQuantity(unit === "adet" ? String(Math.round(next)) : next.toFixed(1));
  }

  async function handleSave() {
    if (!token || !id) return;

    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!quantity || Number.isNaN(parsedQuantity) || parsedQuantity < 0) {
      setErrorMessage("Geçerli bir miktar gir.");
      return;
    }

    if (parsedQuantity === 0) {
      Alert.alert(
        `${name} tükendi mi?`,
        "0 miktarla kilerde kalmasının bir faydası yok — bu ürünü tamamen kaldıralım mı?",
        [
          { text: "İptal", style: "cancel" },
          { text: "Bozuldu, attım", onPress: () => handleZeroOut("expired") },
          { text: "Tükettim", onPress: () => handleZeroOut("consumed") },
        ]
      );
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateProduct(token, id, {
        quantity: parsedQuantity,
        unit,
        manualExpireDate: manualExpireDate ? manualExpireDate.toISOString() : null,
      });
      router.back();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Ürün güncellenirken bir hata oluştu."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleZeroOut(reason: "consumed" | "expired") {
    if (!token || !id) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await deleteProduct(token, id, reason);
      refreshWasteScore();
      router.back();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Ürün güncellenirken bir hata oluştu."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function clearManualDate() {
    setManualExpireDate(null);
    setExpireDateSource("estimated");
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-[#0B1220]">
        {showSpinner ? <ActivityIndicator color="#047857" /> : null}
      </View>
    );
  }

  if (loadErrorMessage) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6 bg-white dark:bg-[#0B1220]">
        <Text className="text-ink-muted dark:text-slate-400 text-center">{loadErrorMessage}</Text>
        <Pressable onPress={load} className="active:opacity-70">
          <Text className="text-brand-green font-semibold">Tekrar dene</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-white dark:bg-[#0B1220] px-6 pt-6">
      <Text className="text-ink dark:text-white font-semibold text-lg capitalize mb-4">
        {name}
      </Text>

      <View className="gap-4">
        <View>
          <Text className="text-ink-muted dark:text-slate-400 mb-1 text-sm">Miktar</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => bumpQuantity(-1)}
              accessibilityRole="button"
              accessibilityLabel="Miktarı azalt"
              className="items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 active:opacity-70"
              style={{ width: 44, height: 52 }}>
              <Text className="text-ink-muted dark:text-slate-400 text-xl font-semibold">−</Text>
            </Pressable>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              accessibilityLabel="Miktar"
              className="flex-1 border border-slate-200 dark:border-white/10 rounded-xl px-4 text-base text-ink dark:text-white bg-slate-50 dark:bg-white/5 text-center"
              style={{ height: 52, paddingVertical: 0 }}
            />
            <Pressable
              onPress={() => bumpQuantity(1)}
              accessibilityRole="button"
              accessibilityLabel="Miktarı artır"
              className="items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 active:opacity-70"
              style={{ width: 44, height: 52 }}>
              <Text className="text-ink-muted dark:text-slate-400 text-xl font-semibold">+</Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Text className="text-ink-muted dark:text-slate-400 mb-1 text-sm">Birim</Text>
          <View className="flex-row gap-2">
            {UNITS.map((option) => (
              <Pressable
                key={option}
                onPress={() => setUnit(option)}
                className={`flex-1 items-center py-3 rounded-xl border ${
                  unit === option
                    ? "bg-brand-green border-brand-green"
                    : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
                }`}>
                <Text
                  className={
                    unit === option
                      ? "text-white font-semibold"
                      : "text-ink-muted dark:text-slate-400"
                  }>
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text className="text-ink-muted dark:text-slate-400 mb-1 text-sm">Son kullanma tarihi</Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            className="border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 bg-slate-50 dark:bg-white/5 active:opacity-70">
            <Text className="text-ink dark:text-white">
              {manualExpireDate
                ? formatDate(manualExpireDate)
                : expireDateSource === "estimated"
                  ? "Tahmini tarih kullanılıyor — değiştirmek için dokun"
                  : "Tarih seç"}
            </Text>
          </Pressable>
          {manualExpireDate ? (
            <Pressable onPress={clearManualDate} className="py-2 active:opacity-70">
              <Text className="text-slate-500 dark:text-slate-400 text-sm">Tahmini tarihe dön</Text>
            </Pressable>
          ) : null}
        </View>

        {errorMessage ? (
          <Text className="text-red-600 dark:text-red-400 text-sm text-center">{errorMessage}</Text>
        ) : null}

        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80 disabled:opacity-60">
          {isSaving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-base font-semibold">Kaydet</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white dark:bg-[#151F2E] rounded-t-3xl px-4 pt-2 pb-8">
            <View className="items-center py-2">
              <View className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            </View>
            <DateTimePicker
              value={manualExpireDate ?? new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              themeVariant={resolvedScheme === "dark" ? "dark" : "light"}
              onChange={(_, selectedDate) => {
                if (Platform.OS !== "ios") setShowDatePicker(false);
                if (selectedDate) setManualExpireDate(selectedDate);
              }}
            />
            {Platform.OS === "ios" ? (
              <Pressable
                onPress={() => setShowDatePicker(false)}
                className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80">
                <Text className="text-white text-base font-semibold">Tamam</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
