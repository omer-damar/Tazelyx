const OpenAI = require("openai");
const config = require("../config");
const { normalizeProductName } = require("./shelfLife");

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
  const response = await client.chat.completions.create({
    // Model adı config.js üzerinden (ve gerekirse .env > AI_MODEL ile) yönetilir.
    model: config.AI_MODEL,
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

  // Sadece TEK yön: kilerdeki ürün adı, malzeme metninde tam kelime(ler)
  // olarak geçmeli. Ters yön (malzeme, kilerdeki ürünün İÇİNDE geçiyor mu)
  // BİLEREK kaldırıldı — "salça" gibi kısa/genel bir malzemeyi "domates
  // salçası" gibi çok daha spesifik bir kiler ürünü üzerinden yetkilendirmek
  // yanlış pozitif üretiyordu.
  return normalizedProductNames.some((productName) =>
    nameAppearsAsWholeWord(normalizedIngredient, productName)
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
