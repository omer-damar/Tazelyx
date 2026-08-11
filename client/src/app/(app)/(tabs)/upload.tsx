import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { LyxMascot } from "@/components/LyxMascot";
import { UploadTabHeaderRight } from "@/components/TabHeaderActions";
import { useAuth } from "@/context/AuthContext";
import { useThemePreference } from "@/context/ThemeContext";
import { useWasteScore } from "@/context/WasteScoreContext";
import { ApiError, createProductsBulk, uploadReceipt, type ParsedProduct } from "@/lib/api";
import { TARA_MOOD_IMAGES } from "@/lib/lyxMoodImages";

type PickedImage = { uri: string; name: string; mimeType: string };

type ReviewItem = ParsedProduct & {
  id: string;
  selected: boolean;
  manualExpireDate: Date | null;
};

const UNITS = ["kg", "lt", "adet"] as const;

function formatDate(date: Date) {
  return date.toLocaleDateString("tr-TR");
}

export default function UploadReceiptScreen() {
  const { token } = useAuth();
  const { resolvedScheme } = useThemePreference();
  const { score: wasteScore } = useWasteScore();

  const [image, setImage] = useState<PickedImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [datePickerForId, setDatePickerForId] = useState<string | null>(null);
  const [isAddingManualItem, setIsAddingManualItem] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualUnit, setManualUnit] = useState<(typeof UNITS)[number]>("adet");
  const [manualItemError, setManualItemError] = useState<string | null>(null);

  function resetAll() {
    setImage(null);
    setReviewItems(null);
    setErrorMessage(null);
    setSavedCount(null);
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Fiş fotoğrafı çekebilmek için kamera izni gerekiyor.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    handlePickerResult(result);
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage("Fiş fotoğrafı seçebilmek için galeri izni gerekiyor.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    handlePickerResult(result);
  }

  function handlePickerResult(pickerResult: ImagePicker.ImagePickerResult) {
    if (pickerResult.canceled) return;

    const asset = pickerResult.assets[0];
    setErrorMessage(null);
    setReviewItems(null);
    setSavedCount(null);
    setImage({
      uri: asset.uri,
      name: asset.fileName || `receipt-${Date.now()}.jpg`,
      mimeType: asset.mimeType || "image/jpeg",
    });
  }

  async function handleUpload() {
    if (!image || !token) return;

    setIsUploading(true);
    setErrorMessage(null);
    try {
      const uploadResult = await uploadReceipt(token, image);
      setReviewItems(
        uploadResult.parsedProducts.map((product, index) => ({
          ...product,
          id: String(index),
          selected: true,
          manualExpireDate: null,
        }))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Fiş yüklenirken bir hata oluştu."
      );
    } finally {
      setIsUploading(false);
    }
  }

  function toggleSelected(id: string) {
    setReviewItems((current) =>
      current?.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)) ?? null
    );
  }

  function setItemDate(id: string, date: Date) {
    setReviewItems((current) =>
      current?.map((item) => (item.id === id ? { ...item, manualExpireDate: date } : item)) ?? null
    );
  }

  function openManualItemForm() {
    setManualName("");
    setManualQuantity("");
    setManualUnit("adet");
    setManualItemError(null);
    setIsAddingManualItem(true);
  }

  function handleAddManualItem() {
    const parsedQuantity = Number(manualQuantity.replace(",", "."));

    if (!manualName.trim()) {
      setManualItemError("Ürün adı gerekli.");
      return;
    }

    if (!manualQuantity || Number.isNaN(parsedQuantity) || parsedQuantity < 0) {
      setManualItemError("Geçerli bir miktar gir.");
      return;
    }

    setReviewItems((current) => [
      ...(current ?? []),
      {
        id: `manual-${Date.now()}`,
        name: manualName.trim(),
        quantity: parsedQuantity,
        unit: manualUnit,
        selected: true,
        manualExpireDate: null,
      },
    ]);
    setIsAddingManualItem(false);
  }

  async function handleSaveSelected() {
    if (!reviewItems || !token) return;

    const selectedItems = reviewItems.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      setErrorMessage("Kilere eklemek için en az bir ürün seç.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const { count } = await createProductsBulk(
        token,
        selectedItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          manualExpireDate: item.manualExpireDate ? item.manualExpireDate.toISOString() : undefined,
        }))
      );
      setSavedCount(count);
      setReviewItems(null);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Ürünler kaydedilirken bir hata oluştu."
      );
    } finally {
      setIsSaving(false);
    }
  }

  const editingItem = reviewItems?.find((item) => item.id === datePickerForId) ?? null;

  return (
    <>
      <AppHeader
        title="Fiş Tara"
        left={<LyxMascot moodImages={TARA_MOOD_IMAGES} score={wasteScore} />}
        right={<UploadTabHeaderRight />}
      />
      <SafeAreaView edges={["bottom"]} className="flex-1 bg-surface dark:bg-[#0B1220]">
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {savedCount !== null ? (
          <View className="bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100 dark:border-white/10 p-5">
            <View className="items-center mb-3">
              <Ionicons name="checkmark-circle" size={48} color="#047857" />
            </View>
            <Text className="text-ink dark:text-white font-semibold text-lg text-center mb-1">
              Kilere eklendi
            </Text>
            <Text className="text-ink-muted dark:text-slate-400 text-center text-sm mb-4">
              {savedCount} ürün kilerine eklendi.
            </Text>
            <Pressable
              onPress={() => {
                resetAll();
                router.navigate("/(app)/(tabs)");
              }}
              accessibilityRole="button"
              accessibilityLabel="Kilere git"
              className="bg-brand-green rounded-xl py-4 items-center active:opacity-80">
              <Text className="text-white text-base font-semibold">Kilere Git</Text>
            </Pressable>
            <Pressable
              onPress={resetAll}
              accessibilityRole="button"
              accessibilityLabel="Başka bir fiş yükle"
              className="items-center py-3 active:opacity-70">
              <Text className="text-ink-muted dark:text-slate-400">Başka bir fiş yükle</Text>
            </Pressable>
          </View>
        ) : reviewItems ? (
          <>
            {reviewItems.length === 0 ? (
              <View className="items-center justify-center mt-10 mb-6 gap-3 px-6">
                <View className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-500/10 items-center justify-center">
                  <Ionicons name="alert-circle-outline" size={36} color="#D97706" />
                </View>
                <Text className="text-ink dark:text-white font-semibold text-base text-center">
                  Fişten hiçbir ürün okunamadı
                </Text>
                <Text className="text-ink-muted dark:text-slate-400 text-center">
                  Fotoğraf net değilse tekrar dener, ya da aşağıdan ürünleri elle ekleyebilirsin.
                </Text>
              </View>
            ) : (
              <Text className="text-ink-muted dark:text-slate-400 text-sm mb-3">
                Kilere eklemek istemediğin ürünlerin işaretini kaldır, istersen ürün bazlı son
                kullanma tarihi gir.
              </Text>
            )}

            {reviewItems.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100 dark:border-white/10 px-4 py-3 mb-3">
                <Pressable
                  onPress={() => toggleSelected(item.id)}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.selected }}
                  accessibilityLabel={`${item.name}${item.selected ? "" : ", seçili değil"}`}
                  className={`w-6 h-6 rounded-md border-2 items-center justify-center mr-3 ${
                    item.selected ? "bg-brand-green border-brand-green" : "border-slate-300 dark:border-slate-600"
                  }`}>
                  {item.selected ? <Ionicons name="checkmark" size={16} color="white" /> : null}
                </Pressable>

                <View className="flex-1 pr-2">
                  <Text
                    className={`font-semibold text-base capitalize ${
                      item.selected ? "text-ink dark:text-white" : "text-slate-400 dark:text-slate-600"
                    }`}>
                    {item.name}
                  </Text>
                  <Text
                    className={
                      item.selected
                        ? "text-ink-muted dark:text-slate-400 text-sm"
                        : "text-slate-300 dark:text-slate-700 text-sm"
                    }>
                    {item.quantity} {item.unit}
                  </Text>
                </View>

                <Pressable
                  onPress={() => setDatePickerForId(item.id)}
                  disabled={!item.selected}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} için son kullanma tarihi ${
                    item.manualExpireDate ? formatDate(item.manualExpireDate) : "gir"
                  }`}
                  className="border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 active:opacity-70 disabled:opacity-40">
                  <Text className="text-ink-muted dark:text-slate-300 text-xs">
                    {item.manualExpireDate ? formatDate(item.manualExpireDate) : "Tarih Gir"}
                  </Text>
                </Pressable>
              </View>
            ))}

            <Pressable
              onPress={openManualItemForm}
              accessibilityRole="button"
              accessibilityLabel="Okunmayan bir ürünü elle ekle"
              className="flex-row items-center justify-center gap-2 border border-dashed border-slate-300 dark:border-white/20 rounded-2xl py-3 mb-3 active:opacity-70">
              <Ionicons name="add-circle-outline" size={18} color="#047857" />
              <Text className="text-brand-green font-semibold">
                Okunmayan bir ürünü elle ekle
              </Text>
            </Pressable>

            {errorMessage ? (
              <Text className="text-red-600 dark:text-red-400 text-sm text-center mt-2 mb-2">{errorMessage}</Text>
            ) : null}

            {reviewItems.length > 0 ? (
              <Pressable
                onPress={handleSaveSelected}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel="Seçilenleri kilere ekle"
                accessibilityState={{ disabled: isSaving, busy: isSaving }}
                className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80 disabled:opacity-60">
                {isSaving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white text-base font-semibold">
                    Seçilenleri Kilere Ekle ({reviewItems.filter((i) => i.selected).length})
                  </Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              onPress={resetAll}
              accessibilityRole="button"
              accessibilityLabel="Vazgeç"
              className="items-center py-3 active:opacity-70">
              <Text className="text-ink-muted dark:text-slate-400">Vazgeç</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View className="bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100 dark:border-white/10 p-5 items-center">
              {image ? (
                <Image
                  source={{ uri: image.uri }}
                  style={{ width: "100%", height: 260, borderRadius: 16 }}
                  resizeMode="cover"
                />
              ) : (
                <View className="w-full h-64 rounded-2xl bg-slate-50 dark:bg-white/5 border border-dashed border-slate-200 dark:border-white/10 items-center justify-center gap-2">
                  <Ionicons name="receipt-outline" size={40} color="#94a3b8" />
                  <Text className="text-slate-400 dark:text-slate-500 text-center px-8">
                    Bir market fişinin fotoğrafını çek veya galeriden seç
                  </Text>
                </View>
              )}

              <View className="flex-row gap-3 mt-4 w-full">
                <Pressable
                  onPress={pickFromCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Kamera ile fiş fotoğrafı çek"
                  className="flex-1 flex-row items-center justify-center gap-2 border border-brand-green rounded-xl py-3 active:opacity-70">
                  <Ionicons name="camera-outline" size={18} color="#047857" />
                  <Text className="text-brand-green font-semibold">Kamera</Text>
                </Pressable>
                <Pressable
                  onPress={pickFromLibrary}
                  accessibilityRole="button"
                  accessibilityLabel="Galeriden fiş fotoğrafı seç"
                  className="flex-1 flex-row items-center justify-center gap-2 border border-brand-green rounded-xl py-3 active:opacity-70">
                  <Ionicons name="images-outline" size={18} color="#047857" />
                  <Text className="text-brand-green font-semibold">Galeri</Text>
                </Pressable>
              </View>
            </View>

            {errorMessage ? (
              <Text className="text-red-600 dark:text-red-400 text-sm text-center mt-4">{errorMessage}</Text>
            ) : null}

            <Pressable
              onPress={handleUpload}
              disabled={!image || isUploading}
              accessibilityRole="button"
              accessibilityLabel="Fişi yükle"
              accessibilityState={{ disabled: !image || isUploading, busy: isUploading }}
              className="bg-brand-green rounded-xl py-4 items-center mt-5 active:opacity-80 disabled:opacity-40">
              {isUploading ? (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator color="white" />
                  <Text className="text-white text-base font-semibold">
                    Fiş okunuyor, biraz sürebilir...
                  </Text>
                </View>
              ) : (
                <Text className="text-white text-base font-semibold">Fişi Yükle</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!editingItem}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerForId(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white dark:bg-[#151F2E] rounded-t-3xl px-4 pt-2 pb-8">
            <View className="items-center py-2">
              <View className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            </View>
            <Text className="text-ink dark:text-white font-semibold text-base text-center mb-2">
              {editingItem?.name} — son kullanma tarihi
            </Text>
            <DateTimePicker
              value={editingItem?.manualExpireDate ?? new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              themeVariant={resolvedScheme === "dark" ? "dark" : "light"}
              minimumDate={new Date()}
              onChange={(_, selectedDate) => {
                if (Platform.OS !== "ios") setDatePickerForId(null);
                if (selectedDate && editingItem) setItemDate(editingItem.id, selectedDate);
              }}
            />
            {Platform.OS === "ios" ? (
              <Pressable
                onPress={() => setDatePickerForId(null)}
                accessibilityRole="button"
                accessibilityLabel="Tamam"
                className="bg-brand-green rounded-xl py-4 items-center mt-2 active:opacity-80">
                <Text className="text-white text-base font-semibold">Tamam</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={isAddingManualItem}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddingManualItem(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/40">
          <View className="bg-white dark:bg-[#151F2E] rounded-t-3xl px-4 pt-2 pb-8">
            <View className="items-center py-2">
              <View className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
            </View>
            <Text className="text-ink dark:text-white font-semibold text-base text-center mb-4">
              Ürünü elle ekle
            </Text>

            <View className="gap-3">
              <TextInput
                value={manualName}
                onChangeText={setManualName}
                placeholder="Ürün adı"
                placeholderTextColor="#94a3b8"
                accessibilityLabel="Ürün adı"
                className="border border-slate-200 dark:border-white/10 rounded-xl px-4 text-base text-ink dark:text-white bg-slate-50 dark:bg-white/5"
                style={{ height: 52, paddingVertical: 0 }}
              />
              <TextInput
                value={manualQuantity}
                onChangeText={setManualQuantity}
                placeholder="Miktar (ör. 1.5)"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                accessibilityLabel="Miktar"
                className="border border-slate-200 dark:border-white/10 rounded-xl px-4 text-base text-ink dark:text-white bg-slate-50 dark:bg-white/5"
                style={{ height: 52, paddingVertical: 0 }}
              />
              <View className="flex-row gap-2">
                {UNITS.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setManualUnit(option)}
                    accessibilityRole="radio"
                    accessibilityLabel={option}
                    accessibilityState={{ checked: manualUnit === option }}
                    className={`flex-1 items-center py-3 rounded-xl border ${
                      manualUnit === option
                        ? "bg-brand-green border-brand-green"
                        : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
                    }`}>
                    <Text
                      className={
                        manualUnit === option
                          ? "text-white font-semibold"
                          : "text-ink-muted dark:text-slate-300"
                      }>
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {manualItemError ? (
              <Text className="text-red-600 dark:text-red-400 text-sm text-center mt-3">{manualItemError}</Text>
            ) : null}

            <Pressable
              onPress={handleAddManualItem}
              accessibilityRole="button"
              accessibilityLabel="Listeye ekle"
              className="bg-brand-green rounded-xl py-4 items-center mt-4 active:opacity-80">
              <Text className="text-white text-base font-semibold">Listeye Ekle</Text>
            </Pressable>
            <Pressable
              onPress={() => setIsAddingManualItem(false)}
              accessibilityRole="button"
              accessibilityLabel="Vazgeç"
              className="items-center py-3 active:opacity-70">
              <Text className="text-ink-muted dark:text-slate-400">Vazgeç</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </SafeAreaView>
    </>
  );
}
