const OpenAI = require("openai");
const config = require("../config");
const { normalizeProductName } = require("./shelfLife");
const { createChatCompletionWithFallback } = require("./aiModelFallback");

// AI sağlayıcısı config.js üzerinden (AI_PROVIDER ile) seçiliyor. Gemini/Groq
// ikisi de OpenAI-uyumlu bir endpoint sunduğu için, sağlayıcı değişse bile
// bu dosyanın geri kalanı (şema doğrulama, hata ayrıştırma, malzeme filtresi)
// hiç değişmeden çalışmaya devam ediyor.
const client = new OpenAI({
  apiKey: config.AI_API_KEY,
  baseURL: config.AI_BASE_URL,
  // 30 saniyelik timeout tanımlı — aksi halde AI servisi beklenenden yavaş
  // yanıt verirse istek süresiz asılı kalabilir.
  timeout: 30 * 1000,
});

// Bu sistem promptu, "Akıllı Kiler" projesinin asıl amacına (kilerdeki
// ürünleri bozulmadan önce değerlendirip gıda israfını azaltmak) göre
// tasarlandı. Detaylı kurallar (sadece stoktakileri kullan, çeşitlilik,
// çıktı şeması vb.) her istek için routes/recipes.js > buildRecipePrompt()
// içinde ayrıca veriliyor; burada sadece kalıcı persona/üslup tanımlanıyor.
const SYSTEM_PROMPT =
  "Sen, Türkiye'nin en çok kullanılan yemek tarifi sitelerindeki " +
  "(ör. Nefis Yemek Tarifleri) tarzında yazan, deneyimli bir Türk ev " +
  "aşçısı gibi davranan bir mutfak asistanısın. Amacın, kullanıcının " +
  "kilerindeki ürünleri iyi değerlendirerek gıda israfını azaltmasına " +
  "yardımcı olmak. Türkçeyi bir çeviri motoru gibi değil, gerçek bir Türk " +
  "aşçının yazdığı gibi doğal ve akıcı kullanırsın; ölçüleri su bardağı/" +
  "yemek kaşığı/çay kaşığı gibi Türk mutfağında alışılmış, pratik " +
  "birimlerle verirsin; gerçekçi pişirme süre ve yöntemlerine sadık " +
  "kalırsın. Cevabın SADECE JSON formatında olmalı, başka açıklama ekleme.";

class InvalidAiResponseError extends Error {
  constructor(reason) {
    super(`AI yanıtı beklenen formatta değil: ${reason}`);
    this.name = "InvalidAiResponseError";
  }
}

// AI'dan dönen yanıtın şeması burada doğrulanır — model beklenmedik bir
// yapı dönerse (recipes eksik, ingredients dizisi yerine düz metin vb.)
// bu, frontend'e gitmeden önce yakalanır.
function isValidRecipesPayload(payload) {
  return (
    payload &&
    Array.isArray(payload.recipes) &&
    payload.recipes.length > 0 &&
    payload.recipes.every(
      (recipe) =>
        recipe &&
        typeof recipe.title === "string" &&
        typeof recipe.description === "string" &&
        typeof recipe.category === "string" &&
        typeof recipe.servings === "string" &&
        Array.isArray(recipe.ingredients) &&
        Array.isArray(recipe.steps) &&
        typeof recipe.estimatedTime === "string" &&
        typeof recipe.tip === "string"
    )
  );
}

async function generateRecipeSuggestions(prompt) {
  const response = await createChatCompletionWithFallback(client, config.AI_MODEL_CHAIN, {
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    // Kontrolsüz/aşırı uzun yanıtları (ve gereksiz maliyeti) önlemek için bir
    // üst sınır var. Gemini gibi bazı sağlayıcılar görünür çıktıdan önceki iç
    // muhakeme (reasoning) token'larını da bu bütçeden harcar, bu yüzden
    // düşük bir değer 3 tam tarif üretilmeden "length" ile yarıda kesilmeye
    // yol açar.
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InvalidAiResponseError("yanıt geçerli bir JSON değil");
  }

  if (!isValidRecipesPayload(parsed)) {
    throw new InvalidAiResponseError("recipes alanı eksik veya beklenen alanları içermiyor");
  }

  return parsed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// name'in text içinde TAM KELİME (ya da kelime öbeği) olarak geçip
// geçmediğini kontrol eder — alt-dizge olarak değil. Bu, "su" (temel
// malzeme) anahtarının "sucuk"/"susam"/"sumak" gibi alakasız kelimelerin
// İÇİNDE yakalanmasını engelliyor. Bilinen tek istisna: "su bardağı" gibi
// çok yaygın bir Türk mutfağı ölçü birimi de kelime olarak "su" içeriyor —
// bu durumda "su" gerçekten bir kelime olarak geçtiği için (ölçü birimi
// olsa bile) staple sayılması kabul edilebilir bir sınır durumu, derin bir
// birim ayrıştırması bu projenin kapsamı dışında.
function nameAppearsAsWholeWord(text, name) {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);
}

// client/src/lib/categorize.ts'teki SUFFIX_TOLERANCE ile aynı fikir: Türkçe
// eklemeli bir dil, "salça" tabanı metinde "salçası" (iyelik eki) olarak
// geçebiliyor — bu ekin sonuna kadar \b...\b ile arasak "salca" ile "salcasi"
// arasında (aralarında boşluk olmadığı için) hiç kelime sınırı bulunmaz,
// eşleşme kaçar. 2 karaktere kadar ek toleransı, asıl kelimeyi bozmadan bu
// yaygın ekleri (-sı/-si/-ı/-i/-lı vb.) yutuyor.
const SUFFIX_TOLERANCE = 2;

function nameAppearsAsWholeWordWithSuffixTolerance(text, name) {
  return new RegExp(`\\b${escapeRegExp(name)}\\w{0,${SUFFIX_TOLERANCE}}\\b`).test(text);
}

// AI'ya "sadece kilerdekileri kullan" desek de, modeller bazen elimizde
// olmayan bir malzemeyi (ör. "1 adet limon") tarife dahil edebiliyor. Prompt
// tek başına yeterli bir güvence değil; bu yüzden dönen her tarifin
// malzemelerini kilerdeki ürünlerle (+ temel mutfak malzemeleriyle)
// karşılaştırıp uymayanları eliyoruz.
function ingredientIsAvailable(ingredientText, normalizedProductNames) {
  const normalizedIngredient = normalizeProductName(ingredientText);

  const isStaple = config.BASIC_PANTRY_STAPLES.some((staple) =>
    nameAppearsAsWholeWord(normalizedIngredient, staple)
  );
  if (isStaple) return true;

  // İKİ yönlü kontrol: kilerdeki ürün adı malzeme metninde geçiyor mu, YA DA
  // malzeme metni kilerdeki ürün adının içinde geçiyor mu. Daha önceki bir
  // düzeltme ters yönü (malzeme, ürünün İÇİNDE mi) "yanlış pozitif" gerekçesiyle
  // tamamen kaldırmıştı, ama gerçek kullanımda bunun etkisi tam tersiydi:
  // kiler ürünleri genelde fiş OCR'ından gelen spesifik/markalı isimler
  // ("domates salçası"), AI'nın yazdığı malzemeler ise genelde kısa/jenerik
  // terimler ("salça") — ters yön olmadan kilerde gayet mevcut bir ürün bile
  // tarifi elemeye yetiyordu (bkz. kullanıcı raporu, gerçek cihazda "uygun
  // tarif bulunamadı"). Tam kelime + ek toleransı zaten "su" → "sucuk" gibi
  // asılsız alt-dize eşleşmelerini önlüyor, iki yönü birden açmak güvenli.
  return normalizedProductNames.some(
    (productName) =>
      nameAppearsAsWholeWordWithSuffixTolerance(normalizedIngredient, productName) ||
      nameAppearsAsWholeWordWithSuffixTolerance(productName, normalizedIngredient)
  );
}

function filterRecipesToAvailableIngredients(recipesPayload, productNames) {
  const normalizedProductNames = productNames.map(normalizeProductName);

  const compliantRecipes = recipesPayload.recipes.filter((recipe) =>
    recipe.ingredients.every((ingredient) =>
      ingredientIsAvailable(ingredient, normalizedProductNames)
    )
  );

  return { recipes: compliantRecipes };
}

module.exports = {
  generateRecipeSuggestions,
  filterRecipesToAvailableIngredients,
  InvalidAiResponseError,
};
