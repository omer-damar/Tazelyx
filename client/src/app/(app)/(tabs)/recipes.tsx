import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { daysUntil } from "@/components/ExpireBadge";
import { LyxMascot } from "@/components/LyxMascot";
import { DefaultTabHeaderRight } from "@/components/TabHeaderActions";
import { useAuth } from "@/context/AuthContext";
import { useWasteScore } from "@/context/WasteScoreContext";
import { ApiError, getRecipeSuggestions, type PrioritizedProduct, type Recipe } from "@/lib/api";
import { TARIFLER_MOOD_IMAGES } from "@/lib/lyxMoodImages";
import { toAsciiLower } from "@/lib/turkish";

// Bu tarifin, kilerdeki HANGİ ürünün bozulmasını önlemeye yardımcı olduğunu
// bulur — prioritizedProducts backend'de zaten aciliyete göre (en az gün
// kalan önce) sıralı geliyor, bu yüzden tarifin malzemeleriyle eşleşen İLK
// ürün, o tarif için en acil/en anlamlı olanı.
function findUrgentIngredient(recipe: Recipe, prioritizedProducts: PrioritizedProduct[]) {
  const normalizedIngredients = recipe.ingredients.map(toAsciiLower);

  return (
    prioritizedProducts.find((product) => {
      const normalizedProduct = toAsciiLower(product.name);
      return normalizedIngredients.some(
        (ingredient) =>
          ingredient.includes(normalizedProduct) || normalizedProduct.includes(ingredient)
      );
    }) ?? null
  );
}

function RecipeCard({
  recipe,
  prioritizedProducts,
}: {
  recipe: Recipe;
  prioritizedProducts: PrioritizedProduct[];
}) {
  const urgentProduct = findUrgentIngredient(recipe, prioritizedProducts);
  const daysLeft = urgentProduct ? daysUntil(urgentProduct.effectiveExpireDate) : null;

  return (
    <View className="bg-white dark:bg-[#151F2E] rounded-2xl border border-slate-100/80 dark:border-white/10 p-4 mb-4">
      <View className="flex-row items-center gap-2 mb-1">
        <View className="bg-emerald-50 dark:bg-emerald-500/10 rounded-full px-3 py-1">
          <Text className="text-brand-green text-xs font-semibold">{recipe.category}</Text>
        </View>
        <Text className="text-ink-muted dark:text-slate-400 text-xs">
          {recipe.servings} · {recipe.estimatedTime}
        </Text>
      </View>

      <Text className="text-ink dark:text-white font-semibold text-lg mb-1">{recipe.title}</Text>
      <Text className="text-ink-muted dark:text-slate-400 text-sm mb-3">{recipe.description}</Text>

      {urgentProduct && daysLeft !== null ? (
        <View className="bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2 mb-3 flex-row items-center gap-2">
          <Ionicons name="alarm-outline" size={16} color="#D97706" />
          <Text className="text-amber-700 dark:text-amber-400 text-sm flex-1">
            Bu tarif, "{urgentProduct.name}" ürününü değerlendirmene yardımcı oluyor —{" "}
            {daysLeft <= 0 ? "son kullanma tarihi bugün doluyor" : `sadece ${daysLeft} gün kaldı`}!
          </Text>
        </View>
      ) : null}

      <Text className="text-ink dark:text-white font-semibold text-sm mb-1">Malzemeler</Text>
      {recipe.ingredients.map((ingredient, index) => (
        <Text key={index} className="text-ink-muted dark:text-slate-400 text-sm">
          • {ingredient}
        </Text>
      ))}

      <Text className="text-ink dark:text-white font-semibold text-sm mt-3 mb-1">Hazırlanışı</Text>
      {recipe.steps.map((step, index) => (
        <Text key={index} className="text-ink-muted dark:text-slate-400 text-sm mb-1">
          {index + 1}. {step}
        </Text>
      ))}

      {recipe.tip ? (
        <View className="bg-amber-50 dark:bg-amber-500/10 rounded-xl px-3 py-2 mt-3">
          <Text className="text-amber-700 dark:text-amber-400 text-sm">💡 {recipe.tip}</Text>
        </View>
      ) : null}

      {recipe.sourceLink ? (
        <Pressable
          onPress={() => {
            const url = recipe.sourceLink?.url;
            if (url) Linking.openURL(url).catch(() => Alert.alert("Açılamadı", "Bağlantı açılırken bir hata oluştu."));
          }}
          accessibilityRole="link"
          accessibilityLabel={`İlgili gerçek tarif: ${recipe.sourceLink.title}`}
          className="flex-row items-center gap-2 mt-3 active:opacity-70">
          <Ionicons name="link-outline" size={14} color="#047857" />
          <Text className="text-brand-green text-xs flex-1 underline" numberOfLines={1}>
            İlgili gerçek tarif: {recipe.sourceLink.title}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function RecipesScreen() {
  const { token } = useAuth();
  const { score: wasteScore } = useWasteScore();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [prioritizedProducts, setPrioritizedProducts] = useState<PrioritizedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSuggest() {
    if (!token) return;

    setIsLoading(true);
    setErrorMessage(null);
    setHasSearched(true);
    try {
      const { recipes: result, prioritizedProducts: products } = await getRecipeSuggestions(token);
      setRecipes(result.recipes);
      setPrioritizedProducts(products);
    } catch (error) {
      setRecipes([]);
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Tarif önerisi alınırken bir hata oluştu."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <AppHeader
        title="Tarifler"
        left={<LyxMascot moodImages={TARIFLER_MOOD_IMAGES} score={wasteScore} />}
        right={<DefaultTabHeaderRight />}
      />
      <SafeAreaView edges={["bottom"]} className="flex-1 bg-surface dark:bg-[#0B1220]">
      <View className="px-4 pt-4 pb-2">
        <Pressable
          onPress={handleSuggest}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityLabel={hasSearched ? "Yeni tarifler öner" : "Kilerime göre tarif öner"}
          className="bg-brand-green rounded-xl py-4 items-center active:opacity-80 disabled:opacity-60">
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-base font-semibold">
              {hasSearched ? "Yeni Tarifler Öner" : "Kilerime Göre Tarif Öner"}
            </Text>
          )}
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
        {isLoading ? (
          // isLoading kontrolü olmadan, handleSuggest içinde hasSearched
          // await'ten ÖNCE true olduğu için bu blok yerine aşağıdaki
          // "recipes.length === 0" dalı bir an için (gerçek sonuç gelene
          // kadar) yanlışlıkla "uygun tarif bulunamadı" gösteriyordu —
          // buton hâlâ yükleniyorken ekranda "bulunamadı" yazısı görünen
          // gerçek bir kullanıcı raporuydu.
          <View className="items-center mt-16 gap-3 px-8">
            <ActivityIndicator color="#047857" />
            <Text className="text-ink-muted dark:text-slate-400 text-center">
              Tarifler hazırlanıyor, biraz sürebilir...
            </Text>
          </View>
        ) : errorMessage ? (
          <Text className="text-ink-muted dark:text-slate-400 text-center mt-8 px-4">
            {errorMessage}
          </Text>
        ) : !hasSearched ? (
          <View className="items-center mt-16 gap-3 px-8">
            <View className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 items-center justify-center">
              <Ionicons name="nutrition-outline" size={36} color="#047857" />
            </View>
            <Text className="text-ink-muted dark:text-slate-400 text-center">
              Kilerindeki ürünlere göre AI'ın önereceği tarifleri görmek için yukarıdaki butona bas.
            </Text>
          </View>
        ) : recipes.length === 0 ? (
          <View className="items-center mt-16 gap-3 px-8">
            <View className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-500/10 items-center justify-center">
              <Ionicons name="sad-outline" size={36} color="#D97706" />
            </View>
            <Text className="text-ink dark:text-white font-semibold text-base text-center">
              Uygun bir tarif bulunamadı
            </Text>
            <Text className="text-ink-muted dark:text-slate-400 text-center">
              Kilerindeki ürünlerle uyumlu bir tarif üretilemedi — birkaç ürün daha ekleyip tekrar
              deneyebilirsin.
            </Text>
          </View>
        ) : (
          recipes.map((recipe, index) => (
            <RecipeCard key={index} recipe={recipe} prioritizedProducts={prioritizedProducts} />
          ))
        )}
      </ScrollView>
      </SafeAreaView>
    </>
  );
}
