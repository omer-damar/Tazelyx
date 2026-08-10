import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { ExpireBadge } from "@/components/ExpireBadge";
import { LyxMascot } from "@/components/LyxMascot";
import { DefaultTabHeaderRight } from "@/components/TabHeaderActions";
import { useAuth } from "@/context/AuthContext";
import { useThemePreference } from "@/context/ThemeContext";
import { useWasteScore } from "@/context/WasteScoreContext";
import { ApiError, deleteProduct, getProducts, type Product } from "@/lib/api";
import { categorizeProduct } from "@/lib/categorize";
import { KILER_MOOD_IMAGES } from "@/lib/lyxMoodImages";
import { syncExpiryNotifications } from "@/lib/notifications";
import { useDelayedLoading } from "@/lib/useDelayedLoading";

type SortBy = "recent" | "name" | "expiry" | "category";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "recent", label: "Yeni Eklenen" },
  { value: "name", label: "İsme Göre" },
  { value: "expiry", label: "SKT'ye Göre" },
  { value: "category", label: "Kategoriye Göre" },
];

const UNDO_WINDOW_MS = 4000;

function ProductRow({
  product,
  onSwipeAction,
}: {
  product: Product;
  onSwipeAction: (product: Product, reason: "consumed" | "expired") => void;
}) {
  const swipeableRef = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={swipeableRef}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onSwipeAction(product, "consumed");
          }}
          style={{ backgroundColor: "#047857" }}
          className="justify-center items-center px-6 rounded-2xl mb-3 active:opacity-80">
          <Ionicons name="checkmark-circle-outline" size={20} color="white" />
          <Text className="text-white text-xs font-semibold mt-1">Tükettim</Text>
        </Pressable>
      )}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onSwipeAction(product, "expired");
          }}
          style={{ backgroundColor: "#EF5A5A" }}
          className="justify-center items-center px-6 rounded-2xl mb-3 active:opacity-80">
          <Ionicons name="close-circle-outline" size={20} color="white" />
          <Text className="text-white text-xs font-semibold mt-1">Bozuldu</Text>
        </Pressable>
      )}>
      <Pressable
        onPress={() => router.push({ pathname: "/(app)/edit-product", params: { id: product._id } })}
        className="flex-row items-center justify-between bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 px-4 py-3 mb-3 active:opacity-70"
        style={{
          shadowColor: "#0C1624",
          shadowOpacity: 0.05,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 1,
        }}>
        <View className="flex-1 pr-3">
          <Text className="text-ink dark:text-white font-semibold text-base capitalize">
            {product.name}
          </Text>
          <Text className="text-ink-muted dark:text-slate-400 text-sm mt-0.5">
            {product.quantity} {product.unit}
          </Text>
        </View>
        <ExpireBadge effectiveExpireDate={product.effectiveExpireDate} />
      </Pressable>
    </Swipeable>
  );
}

export default function PantryScreen() {
  const { token } = useAuth();
  const { resolvedScheme } = useThemePreference();
  const { score: wasteScore, refresh: refreshWasteScore } = useWasteScore();
  const isDark = resolvedScheme === "dark";
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const showSpinner = useDelayedLoading(isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const [pendingDelete, setPendingDelete] = useState<{
    product: Product;
    index: number;
    reason: "consumed" | "expired";
  } | null>(null);
  const pendingDeleteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // loadProducts, bekleyen bir silme varken sunucudan taze veri çekip
  // üzerine yazabiliyor — bu ref, o anki bekleyen silmenin hangi ürünü
  // kapsadığını (state'e bağımlı kalmadan, closure'ı bayatlatmadan) taze
  // tutuyor, böylece fetch sonucu bu ürünü sessizce dışarıda bırakabiliyor.
  const pendingDeleteRef = useRef<typeof pendingDelete>(null);
  useEffect(() => {
    pendingDeleteRef.current = pendingDelete;
  }, [pendingDelete]);

  const loadProducts = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!token) return;
      if (!options.silent) setIsLoading(true);
      setErrorMessage(null);
      try {
        const { products: fetched } = await getProducts(token);
        const pendingId = pendingDeleteRef.current?.product._id;
        setProducts(pendingId ? fetched.filter((p) => p._id !== pendingId) : fetched);
        syncExpiryNotifications(fetched).catch((error) =>
          console.warn("Bildirimler senkronize edilemedi:", error)
        );
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : "Ürünler yüklenirken bir hata oluştu."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      loadProducts({ silent: products.length > 0 });

      // Ekran odağını kaybederken (ör. başka bir sekmeye geçilirken) bekleyen
      // bir silme varsa hemen commit ediyoruz. Aksi halde: kullanıcı kaydırıp
      // sekme değiştirirse, geri döndüğünde loadProducts sunucudan (henüz
      // silinmemiş) eski listeyi çeker ve "silinen" ürün geri gelirmiş gibi
      // görünürdü; sonra zamanlayıcı dolunca sunucu asıl silmeyi yapardı ve
      // ürün açıklamasız şekilde kaybolurdu.
      return () => {
        const pending = pendingDeleteRef.current;
        if (pending) {
          if (pendingDeleteTimeout.current) clearTimeout(pendingDeleteTimeout.current);
          pendingDeleteTimeout.current = null;
          commitPendingDelete(pending.product, pending.reason);
          setPendingDelete(null);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadProducts])
  );

  function handleRefresh() {
    setIsRefreshing(true);
    loadProducts({ silent: true });
  }

  // Silme, hemen backend'e gitmiyor: önce listeden iyimser (optimistic)
  // olarak kaldırılıyor ve birkaç saniye "Geri Al" seçeneği sunuluyor —
  // yanlışlıkla kaydırıp silmenin önüne geçmek için. Süre dolunca gerçek
  // DELETE isteği atılıyor.
  function commitPendingDelete(product: Product, reason: "consumed" | "expired") {
    if (!token) return;
    deleteProduct(token, product._id, reason)
      .then(() => refreshWasteScore())
      .catch((error) => {
        // Silme backend'de başarısız olursa ürünü geri getiriyoruz VE bunu
        // kullanıcıya açıkça bildiriyoruz — sessiz kalırsa, ürün dakikalar
        // sonra listede açıklamasızca "geri gelmiş" gibi görünürdü.
        setProducts((current) => [product, ...current]);
        Alert.alert(
          "İşlem başarısız",
          `"${product.name}" silinemedi, tekrar deneyebilirsin.`
        );
        console.warn(
          "Ürün silinemedi:",
          error instanceof ApiError ? error.message : error
        );
      });
  }

  function handleSwipeAction(product: Product, reason: "consumed" | "expired") {
    if (pendingDelete) {
      commitPendingDelete(pendingDelete.product, pendingDelete.reason);
      if (pendingDeleteTimeout.current) clearTimeout(pendingDeleteTimeout.current);
    }

    const index = products.findIndex((p) => p._id === product._id);
    setProducts((current) => current.filter((p) => p._id !== product._id));
    setPendingDelete({ product, index, reason });

    pendingDeleteTimeout.current = setTimeout(() => {
      commitPendingDelete(product, reason);
      setPendingDelete(null);
    }, UNDO_WINDOW_MS);
  }

  function handleUndoDelete() {
    if (!pendingDelete) return;
    if (pendingDeleteTimeout.current) clearTimeout(pendingDeleteTimeout.current);

    setProducts((current) => {
      const next = [...current];
      next.splice(pendingDelete.index, 0, pendingDelete.product);
      return next;
    });
    setPendingDelete(null);
  }

  const searchFiltered = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("tr");
    if (!query) return products;
    return products.filter((product) => product.name.toLocaleLowerCase("tr").includes(query));
  }, [products, searchQuery]);

  const visibleProducts = useMemo(() => {
    let list = searchFiltered;

    if (sortBy === "name") {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    } else if (sortBy === "expiry") {
      list = [...list].sort((a, b) => {
        const aTime = a.effectiveExpireDate
          ? new Date(a.effectiveExpireDate).getTime()
          : Infinity;
        const bTime = b.effectiveExpireDate
          ? new Date(b.effectiveExpireDate).getTime()
          : Infinity;
        return aTime - bTime;
      });
    }

    return list;
  }, [searchFiltered, sortBy]);

  const groupedSections = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of searchFiltered) {
      const category = categorizeProduct(product.name);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(product);
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b, "tr"))
      .map(([category, items]) => ({
        title: category,
        data: [...items].sort((a, b) => a.name.localeCompare(b.name, "tr")),
      }));
  }, [searchFiltered]);

  return (
    <>
      <AppHeader
        title="Kiler"
        left={<LyxMascot moodImages={KILER_MOOD_IMAGES} score={wasteScore} />}
        right={<DefaultTabHeaderRight />}
      />
      <SafeAreaView edges={["bottom"]} className="flex-1 bg-slate-50 dark:bg-[#0B1220]">
      <View className="flex-1 px-4 pt-4">
        {isLoading ? (
          showSpinner ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#047857" />
            </View>
          ) : null
        ) : errorMessage ? (
          <View className="flex-1 items-center justify-center gap-3 px-6">
            <Text className="text-slate-500 dark:text-slate-400 text-center">{errorMessage}</Text>
            <Pressable onPress={() => loadProducts()} className="active:opacity-70">
              <Text className="text-brand-green font-semibold">Tekrar dene</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View
              className="flex-row items-center border border-slate-200 dark:border-white/10 rounded-xl px-3 bg-white dark:bg-[#151F2E] mb-3"
              style={{ height: 44 }}>
              <Ionicons name="search-outline" size={18} color="#94a3b8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Kilerinde ara..."
                placeholderTextColor="#94a3b8"
                className="flex-1 ml-2 text-slate-900 dark:text-white"
                style={{ height: 44, paddingVertical: 0 }}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, alignItems: "center" }}
              className="mb-3"
              style={{ flexGrow: 0, height: 40 }}>
              {SORT_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setSortBy(option.value)}
                  className={`px-3.5 rounded-full border justify-center ${
                    sortBy === option.value
                      ? "bg-brand-green border-brand-green"
                      : "bg-white dark:bg-[#151F2E] border-slate-200 dark:border-white/10"
                  }`}
                  style={{ height: 34 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 12,
                      lineHeight: 16,
                      fontWeight: "600",
                      color:
                        sortBy === option.value ? "#ffffff" : isDark ? "#94a3b8" : "#475569",
                    }}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {sortBy === "category" ? (
              <SectionList
                sections={groupedSections}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <ProductRow product={item} onSwipeAction={handleSwipeAction} />
                )}
                renderSectionHeader={({ section }) => (
                  <Text className="text-ink-muted dark:text-slate-400 text-xs font-semibold uppercase mb-2 mt-1">
                    {section.title}
                  </Text>
                )}
                refreshControl={
                  <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#047857" />
                }
                ListEmptyComponent={
                  <View className="items-center justify-center mt-20 gap-3 px-6">
                    <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
                      <Ionicons name="basket-outline" size={36} color="#047857" />
                    </View>
                    <Text className="text-slate-900 dark:text-white font-semibold text-base">
                      Kilerin boş görünüyor
                    </Text>
                  </View>
                }
                contentContainerStyle={{ paddingBottom: 140 }}
                stickySectionHeadersEnabled={false}
              />
            ) : (
              <FlatList
                data={visibleProducts}
                keyExtractor={(item) => item._id}
                renderItem={({ item }) => (
                  <ProductRow product={item} onSwipeAction={handleSwipeAction} />
                )}
                refreshControl={
                  <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#047857" />
                }
                ListEmptyComponent={
                  <View className="items-center justify-center mt-20 gap-3 px-6">
                    <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
                      <Ionicons
                        name={searchQuery ? "search-outline" : "basket-outline"}
                        size={36}
                        color="#047857"
                      />
                    </View>
                    <Text className="text-slate-900 dark:text-white font-semibold text-base">
                      {searchQuery ? "Eşleşen ürün yok" : "Kilerin boş görünüyor"}
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-center">
                      {searchQuery
                        ? "Farklı bir arama terimi dene."
                        : "Sağ alttaki + butonuyla ilk ürününü ekle veya bir fiş yükle."}
                    </Text>
                  </View>
                }
                contentContainerStyle={{ paddingBottom: 140 }}
              />
            )}
          </>
        )}

        {pendingDelete ? (
          <View className="absolute left-4 right-4 bottom-24 bg-slate-900 rounded-xl px-4 py-3 flex-row items-center justify-between">
            <Text className="text-white flex-1 pr-3 capitalize">
              {pendingDelete.product.name}{" "}
              {pendingDelete.reason === "consumed" ? "tüketildi" : "bozuldu"}
            </Text>
            <Pressable onPress={handleUndoDelete} hitSlop={8}>
              <Text className="text-emerald-400 font-semibold">Geri Al</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push("/(app)/add-product")}
          className="absolute bottom-24 right-2 bg-brand-green rounded-full w-14 h-14 items-center justify-center active:opacity-80"
          style={{ elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }}>
          <Text className="text-white text-2xl leading-none">+</Text>
        </Pressable>
      </View>
      </SafeAreaView>
    </>
  );
}
