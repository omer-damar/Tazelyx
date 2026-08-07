const express = require("express");
const OpenAI = require("openai");
const {
  generateRecipeSuggestions,
  filterRecipesToAvailableIngredients,
  InvalidAiResponseError,
} = require("../services/recipeAi");
const { getUsableForRecipeProducts } = require("../services/productQueries");
const { findRelatedRealRecipe } = require("../services/recipeSearch");

const router = express.Router();

function buildRecipePrompt(products) {
  const now = new Date();

  // products, getUsableForRecipeProducts() tarafından zaten effectiveExpireDate'e
  // göre artan sırada döndürülür; burada tekrar sıralama yapılmaz.
  const productLines = products.map((product) => {
    const expireDate = new Date(product.effectiveExpireDate);
    const diffMs = expireDate - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return `- ${product.name} (${product.quantity} ${product.unit}), yaklaşık ${diffDays} gün içinde bozulabilir`;
  });

  return `
KİLERDEKİ MALZEMELER (miktar ve tahmini bozulma süresiyle birlikte):
${productLines.join("\n")}

Bu liste sadece evdeki mevcut stok durumunu gösteriyor. Bir tarifte listedeki
malzemelerin TAMAMINI kullanman gerekmiyor; her tarif için farklı, uygun bir
alt küme seçebilirsin. Tek kısıtlama, aşağıdaki KESİN KURALLAR'ın dışına hiç
çıkmaman.

KESİN KURALLAR:
1. SADECE yukarıdaki listede olan malzemeleri kullan. Tuz, karabiber, su ve
   sıvı yağ dışında, listede OLMAYAN HİÇBİR malzemeyi tarife dahil etme —
   eksik malzeme isteme, "şunu da eklerseniz" gibi öneri de yapma.
2. Bozulma tarihi daha yakın olan ürünlere öncelik ver; önerdiğin tariflerden
   en az biri, listedeki en kısa süre kalan ürünü kullansın.
3. Belirtilen miktarların gerçekçi bir porsiyon için yeterli olup olmadığını
   dikkate al; bir malzeme çok az miktardaysa (ör. 1 adet biber, 0.1 kg soğan)
   o tarifte ana malzeme değil, tamamlayıcı/az miktarda kullanılan bir
   malzeme olarak öner.
4. Yukarıdaki malzemelerle iyi bir tarif çıkaramıyorsan, elindeki
   malzemelerin daha azını kullanan daha basit bir tarif öner; yine de
   listede olmayan bir malzemeye başvurma.

GÖREV:
Bu malzemelerle BİRBİRİNDEN FARKLI 3 tarif öner — üçü de aynı pişirme
yöntemini (ör. üçü de sote/kavurma) kullanan benzer tarifler olmasın; mümkünse
çorba/sulu yemek, fırın/kavurma tarzı ana yemek ve hızlı/pratik bir seçenek
gibi farklı yemek türlerinden seç. Tarifleri, bir çeviri motoru gibi değil,
gerçek bir Türk aşçının yazdığı gibi doğal ve akıcı Türkçeyle yaz.

Her tarif için şu alanları ver:
- title: Tarif adı
- description: Kısa açıklama (1-2 cümle)
- category: Yemek türü (ör. "Çorba", "Ana Yemek", "Aparatif/Pratik", "Salata")
- servings: Kaç kişilik olduğu (ör. "2-3 kişilik")
- ingredients: Gerekli malzemeler, miktarlarıyla birlikte (yalnızca yukarıdaki listeden + tuz/karabiber/su/sıvı yağ)
- steps: Numaralı, kısa ve uygulanabilir hazırlanış adımları; gerçekçi pişirme süre ve yöntemlerine sadık kal
- estimatedTime: Tahmini süre
- tip: Varsa kısa ve işe yarar bir püf noktası (yoksa boş string bırak)

Cevabın SADECE JSON formatında olsun, başka hiçbir açıklama ekleme. Tam olarak
şu yapıda cevap ver:
{
  "recipes": [
    {
      "title": "...",
      "description": "...",
      "category": "...",
      "servings": "...",
      "ingredients": ["..."],
      "steps": ["..."],
      "estimatedTime": "...",
      "tip": "..."
    }
  ]
}
`;
}

router.get("/suggest", async (req, res) => {
  try {
    const products = await getUsableForRecipeProducts(req.userId);

    if (!products.length) {
      return res.status(404).json({
        message: "Tarif önerisi için uygun ürün bulunamadı.",
      });
    }

    const prompt = buildRecipePrompt(products);
    // generateRecipeSuggestions artık AI yanıtını kendi içinde parse edip
    // şemasını doğruluyor; burada elimize geçen değer zaten güvenilir bir
    // { recipes: [...] } nesnesi.
    const aiRecipes = await generateRecipeSuggestions(prompt);

    // Prompt "sadece kilerdekileri kullan" dese de model bazen kilerde
    // olmayan bir malzeme ekleyebiliyor; son güvenlik olarak burada eleniyor.
    const recipes = filterRecipesToAvailableIngredients(
      aiRecipes,
      products.map((p) => p.name)
    );

    if (!recipes.recipes.length) {
      return res.status(422).json({
        message:
          "AI, elimizdeki malzemelerle uyumlu bir tarif üretemedi. Daha fazla malzeme eklemeyi deneyin.",
      });
    }

    // Her tarif için nefisyemektarifleri.com'da GERÇEKTEN var olan, ilgili
    // bir tarif aranıyor (bkz. services/recipeSearch.js) — TAVILY_API_KEY
    // tanımlı değilse bu sessizce null döner, tarifler linksiz gösterilir.
    await Promise.all(
      recipes.recipes.map(async (recipe) => {
        recipe.sourceLink = await findRelatedRealRecipe(`${recipe.title} tarifi`);
      })
    );

    res.json({
      message: "AI tarif önerisi hazırlandı.",
      ingredientsCount: products.length,
      prioritizedProducts: products.map((p) => ({
        name: p.name,
        quantity: p.quantity,
        unit: p.unit,
        effectiveExpireDate: p.effectiveExpireDate,
        expireDateSource: p.expireDateSource,
      })),
      recipes,
    });
  } catch (error) {
    // OpenAI'den gelen timeout/rate-limit/kimlik doğrulama hataları, genel
    // bir 500 yerine kendi anlamına uygun HTTP koduyla ayrı ayrı ele alınır.
    if (error instanceof InvalidAiResponseError) {
      return res.status(502).json({ message: error.message });
    }

    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return res.status(504).json({
        message: "AI servisi zaman aşımına uğradı, lütfen tekrar deneyin.",
      });
    }

    if (error instanceof OpenAI.RateLimitError) {
      return res.status(429).json({
        message: "AI servisi şu anda çok fazla istek alıyor, birazdan tekrar deneyin.",
      });
    }

    if (error instanceof OpenAI.AuthenticationError) {
      return res.status(502).json({
        message: "AI servisiyle kimlik doğrulama hatası oluştu.",
      });
    }

    res.status(500).json({
      message: "AI tarif önerisi oluşturulurken hata oluştu.",
      error: error.message,
    });
  }
});

module.exports = router;
