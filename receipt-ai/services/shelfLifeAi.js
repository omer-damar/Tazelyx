const OpenAI = require("openai");
const config = require("../config");
const { createChatCompletionWithFallback } = require("./aiModelFallback");

// AMAÇ: services/shelfLife.js'teki sabit shelfLifeMap sadece ~20 temel ürünü
// (süt, domates, tavuk vb.) biliyor — bilmediği HER ŞEY (paketli atıştırmalık,
// içecek, vb.) körlemesine config.DEFAULT_SHELF_LIFE_DAYS (7 gün) alıyordu,
// bu genelde yanlış (ör. bir paket kraker 7 günde bozulmaz). Bu servis, SADECE
// map'te eşleşme bulunamayan ürünler için devreye giriyor — bilinen temel
// ürünler için hâlâ anında/ücretsiz sabit liste kullanılıyor, AI'ya sadece
// gerçekten emin olamadığımız durumlarda başvuruluyor (receiptAi.js'teki aynı
// "AI, elle bakım gerektiren listelerin yerini alsın" felsefesi).
const client = new OpenAI({
  apiKey: config.AI_API_KEY,
  baseURL: config.AI_BASE_URL,
  timeout: 15 * 1000,
  // aiModelFallback.js zaten kendi zincirinde bir sonraki modele geçiyor —
  // SDK'nın kendi varsayılan tekrar mekanizması (2 ek deneme) üst üste
  // binmesin diye kapalı (bkz. recipeAi.js'teki aynı gerekçe).
  maxRetries: 0,
});

const SYSTEM_PROMPT = `Sen bir gıda saklama/raf ömrü uzmanısın. Sana Türkçe bir ürün
adı verilecek — bir marketten satın alınıp eve/kilere konmuş bir ürün. Bu ürünün
normal ev koşullarında (oda sıcaklığı veya standart buzdolabı, ürünün türüne göre)
satın alındıktan itibaren kaç gün içinde tüketilmesinin/kullanılmasının makul
olduğunu tahmin et. Bu, üreticinin gerçek son kullanma tarihi DEĞİL, genel/ortalama
bir tahmin. Taze/çabuk bozulan bir gıdaysa (ör. taze sebze/meyve/süt ürünü/et) kısa
bir süre ver; dondurulmuş/konserve/kuru gıda/paketli atıştırmalık/içecek gibi uzun
ömürlü bir ürünse çok daha uzun bir süre ver. Cevabın SADECE şu JSON formatında
olsun, başka hiçbir açıklama ekleme: {"days": <pozitif tam sayı>}`;

async function estimateShelfLifeDaysWithAi(productName) {
  try {
    const response = await createChatCompletionWithFallback(client, config.AI_MODEL_CHAIN, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: productName },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const days = Math.round(Number(parsed.days));

    if (!Number.isFinite(days) || days <= 0) return null;
    return days;
  } catch (error) {
    // AI tahmini başarısız olursa (zaman aşımı/kota/geçersiz yanıt), çağıran
    // taraf zaten config.DEFAULT_SHELF_LIFE_DAYS'e düşüyor — burada sessizce
    // null dönmek yeterli, ürün ekleme işlemini asla bloklamıyoruz.
    console.warn("AI raf ömrü tahmini başarısız:", error.message);
    return null;
  }
}

module.exports = { estimateShelfLifeDaysWithAi };
