import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import {
  addShoppingListItem,
  ApiError,
  deleteShoppingListItem,
  getShoppingList,
  updateShoppingListItem,
  type ShoppingListItem,
} from "@/lib/api";
import { categorizeProduct } from "@/lib/categorize";
import { useDelayedLoading } from "@/lib/useDelayedLoading";

const UNITS = ["kg", "lt", "adet"] as const;

export default function ShoppingListScreen() {
  const { token } = useAuth();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("");
  const [newItemUnit, setNewItemUnit] = useState<(typeof UNITS)[number] | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setErrorMessage(null);
    try {
      const { items: fetched } = await getShoppingList(token);
      setItems(fetched);
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : "Liste yüklenirken bir hata oluştu."
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Kiler'deki (bkz. (tabs)/index.tsx > groupedSections) AYNI kategorileme
  // fonksiyonu ve gruplama deseni — tutarlılık için, kodu tekrar etmeden.
  const groupedSections = useMemo(() => {
    const groups = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const category = categorizeProduct(item.name);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(item);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, "tr"))
      .map(([category, categoryItems]) => ({ title: category, data: categoryItems }));
  }, [items]);

  async function handleAddItem() {
    const name = newItemName.trim();
    if (!token || !name) return;

    const parsedQuantity = newItemQuantity.trim()
      ? Number(newItemQuantity.replace(",", "."))
      : undefined;

    setIsAdding(true);
    try {
      const { item } = await addShoppingListItem(token, {
        name,
        quantity:
          parsedQuantity !== undefined && !Number.isNaN(parsedQuantity)
            ? parsedQuantity
            : undefined,
        unit: newItemUnit ?? undefined,
      });
      setItems((current) => [item, ...current]);
      setNewItemName("");
      setNewItemQuantity("");
      setNewItemUnit(null);
    } catch (error) {
      // Kullanıcının girdiği bilgileri temizlemiyoruz ki tekrar "Ekle"ye
      // basabilsin — ama en azından neden hiçbir şey olmadığını söylüyoruz.
      Alert.alert(
        "Eklenemedi",
        error instanceof ApiError ? error.message : "Ürün listeye eklenirken bir hata oluştu."
      );
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggle(item: ShoppingListItem) {
    if (!token) return;
    const nextChecked = !item.isChecked;
    // İyimser güncelleme: hemen işaretleyip listeyi yeniden sırala (backend
    // zaten işaretlenmemişleri önce döndürüyor), başarısız olursa geri al.
    setItems((current) =>
      current
        .map((i) => (i._id === item._id ? { ...i, isChecked: nextChecked } : i))
        .sort((a, b) => Number(a.isChecked) - Number(b.isChecked))
    );
    try {
      await updateShoppingListItem(token, item._id, { isChecked: nextChecked });
    } catch {
      load();
    }
  }

  async function handleDelete(item: ShoppingListItem) {
    if (!token) return;
    setItems((current) => current.filter((i) => i._id !== item._id));
    try {
      await deleteShoppingListItem(token, item._id);
    } catch {
      load();
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} className="flex-1 bg-slate-50 dark:bg-[#0B1220]">
      <View className="px-4 pt-4 pb-2 gap-2">
        <TextInput
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={handleAddItem}
          placeholder="Ürün adı ekle..."
          placeholderTextColor="#94a3b8"
          returnKeyType="done"
          className="border border-slate-200 dark:border-white/10 rounded-xl px-4 text-base text-slate-900 dark:text-white bg-white dark:bg-white/5"
          style={{ height: 48, paddingVertical: 0 }}
        />

        <View className="flex-row items-center gap-2">
          <TextInput
            value={newItemQuantity}
            onChangeText={setNewItemQuantity}
            placeholder="Miktar (ops.)"
            placeholderTextColor="#94a3b8"
            keyboardType="decimal-pad"
            className="border border-slate-200 dark:border-white/10 rounded-xl px-3 text-base text-slate-900 dark:text-white bg-white dark:bg-white/5"
            style={{ width: 100, height: 44, paddingVertical: 0 }}
          />

          {UNITS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setNewItemUnit((current) => (current === option ? null : option))}
              className={`px-3 rounded-xl border items-center justify-center active:opacity-70 ${
                newItemUnit === option
                  ? "bg-brand-green border-brand-green"
                  : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10"
              }`}
              style={{ height: 44 }}>
              <Text
                className={
                  newItemUnit === option
                    ? "text-white font-semibold text-sm"
                    : "text-slate-600 dark:text-slate-300 text-sm"
                }>
                {option}
              </Text>
            </Pressable>
          ))}

          <Pressable
            onPress={handleAddItem}
            disabled={isAdding || !newItemName.trim()}
            className="flex-1 bg-brand-green rounded-xl items-center justify-center active:opacity-80 disabled:opacity-50"
            style={{ height: 44 }}>
            {isAdding ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="add" size={20} color="white" />
            )}
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        showSpinner ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#047857" />
          </View>
        ) : null
      ) : errorMessage ? (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-slate-500 dark:text-slate-400 text-center">{errorMessage}</Text>
          <Pressable onPress={() => load()} className="active:opacity-70">
            <Text className="text-brand-green font-semibold">Tekrar dene</Text>
          </Pressable>
        </View>
      ) : (
        <SectionList
          sections={groupedSections}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 32 }}
          renderSectionHeader={({ section }) => (
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase mb-2 mt-3 bg-slate-50 dark:bg-[#0B1220]">
              {section.title}
            </Text>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center mt-20 gap-3 px-6">
              <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
                <Ionicons name="cart-outline" size={36} color="#047857" />
              </View>
              <Text className="text-slate-900 dark:text-white font-semibold text-base">
                Alışveriş listen boş
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-center">
                Yukarıdan manuel ekleyebilir, ya da "Tükenmek Üzere" ekranından bir ürünü listeye
                gönderebilirsin.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="flex-row items-center bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100 dark:border-white/10 px-4 py-3 mb-3">
              <Pressable
                onPress={() => handleToggle(item)}
                hitSlop={8}
                className="mr-3 active:opacity-70">
                <View
                  className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                    item.isChecked
                      ? "bg-brand-green border-brand-green"
                      : "border-slate-300 dark:border-slate-600"
                  }`}>
                  {item.isChecked ? <Ionicons name="checkmark" size={14} color="white" /> : null}
                </View>
              </Pressable>

              <View className="flex-1">
                <Text
                  className={`text-base capitalize ${
                    item.isChecked
                      ? "text-slate-400 dark:text-slate-500 line-through"
                      : "text-slate-900 dark:text-white font-medium"
                  }`}>
                  {item.name}
                </Text>
                {item.quantity || item.unit ? (
                  <Text className="text-slate-400 dark:text-slate-500 text-sm mt-0.5">
                    {item.quantity ?? ""} {item.unit ?? ""}
                  </Text>
                ) : null}
              </View>

              {item.source === "prediction" ? (
                <Ionicons name="trending-down-outline" size={14} color="#6366f1" style={{ marginRight: 8 }} />
              ) : null}

              <Pressable onPress={() => handleDelete(item)} hitSlop={8} className="active:opacity-60">
                <Ionicons name="trash-outline" size={18} color="#94a3b8" />
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
