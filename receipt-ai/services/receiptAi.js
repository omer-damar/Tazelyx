const OpenAI = require("openai");
const config = require("../config");
const { createChatCompletionWithFallback } = require("./aiModelFallback");

// AMAÇ: Regex tabanlı market parser'ları (services/parsers/) her yeni market
// için elle bir dosya (kendi gürültü desenleriyle) yazmayı gerektiriyordu —
// onlarca farklı market formatına ölçeklenemez. Bu servis, aynı fiş metnini
// AI'ya vererek SADECE gerçek ürün kalemlerini (mağaza adı/vergi/ödeme/toplam
// gibi gürültüyü değil) çıkarıyor — herhangi bir markette, ek kod yazmadan
// çalışır. Regex parser'lar (routes/upload.js'te) AI çağrısı başarısız
// olursa (zaman aşımı/kota/geçersiz yanıt) devreye giren bir yedek olarak
// tutuluyor, tamamen kaldırılmadı.
const client = new OpenAI({
  apiKey: config.AI_API_KEY,
  baseURL: config.AI_BASE_URL,
  timeout: 30 * 1000,
});

const SYSTEM_PROMPT = `Sen bir Türkiye market fişinin OCR (metne dönüştürülmüş) çıktısını analiz edip
SADECE gerçekten satın alınmış ürün kalemlerini çıkaran bir asistansın.

KURALLAR:
1. Fişteki HER GERÇEK ürün kalemi için bir obje üret: {"name", "quantity", "unit"}.
2. "name": Ürünün düzgün, doğru Türkçe yazımıyla temiz adı. OCR'daki boşluk/
   harf hatalarını olabildiğince düzelt (ör. "MISIR GEVREĞİ" -> "mısır gevreği",
   ASLA Türkçe karakterleri ("ı","ş","ğ","ü","ö","ç") ASCII'ye çevirme). Tüm
   harfleri küçük yaz. Ambalaj üzerindeki gramaj/hacim bilgisini (ör. "500 G",
   "200 ML") İSME DAHİL ETME — bu, "quantity"/"unit" alanlarına gidecek.
3. "quantity" ve "unit": "unit" SADECE "kg", "lt" veya "adet" olabilir.
   - Tartılan ürünlerde (taze meyve/sebze gibi) fişte doğrudan basılı kg
     miktarını aynen kullan.
   - Paketli bir üründe ambalaj üzerinde yazan gramaj/hacim varsa (ör.
     "500 G", "45 g", "200 ML") bunu kg/lt'ye çevir (1000 g = 1 kg,
     1000 ml = 1 lt). Fişte o ürün için AYRICA bir adet sayısı basılıysa
     (ör. ürün satırının hemen öncesinde/sonrasında "2 ADET" gibi ayrı bir
     satır), toplam miktarı bulmak için ambalaj boyutunu bu sayıyla çarp
     (ör. 2 adet x 45 g = 0.09 kg).
   - Ne ağırlık/hacim ne de ayrı bir adet sayısı bilgisi bulamıyorsan
     quantity=1, unit="adet" kullan.
4. Şunları KESİNLİKLE ürün OLARAK DAHİL ETME: mağaza adı/unvanı/adresi,
   TCKN/VKN/vergi dairesi/MERSİS bilgileri, kasiyer/terminal/POS/onay/
   referans/işyeri/işlem/parti/fiş/belge numaraları, kart/banka/ödeme
   bilgileri, "ARA TOPLAM"/"TOPLAM"/"KDV" gibi tutar satırları, tarih/saat,
   barkod/SKU rakam dizileri, "teşekkür ederiz" gibi kapanış mesajları,
   poşet/torba ücreti.
5. Bir satırın gerçek bir ürün olup olmadığından EMİN DEĞİLSEN, listeye DAHİL
   ETME — yanlış pozitiften (gürültüyü ürün sanmaktan) kaçınmak, gerçek bir
   ürünü kaçırmaktan daha önemli.
6. Cevabın SADECE şu JSON şemasında olsun, başka hiçbir açıklama ekleme:
{"products": [{"name": "...", "quantity": 0, "unit": "kg"}]}`;

class InvalidAiReceiptResponseError extends Error {
  constructor(reason) {
    super(`AI fiş yanıtı beklenen formatta değil: ${reason}`);
    this.name = "InvalidAiReceiptResponseError";
  }
}

const ALLOWED_UNITS = ["kg", "lt", "adet"];

function isValidReceiptPayload(payload) {
  return (
    payload &&
    Array.isArray(payload.products) &&
    payload.products.every(
      (product) =>
        product &&
        typeof product.name === "string" &&
        product.name.trim().length > 0 &&
        typeof product.quantity === "number" &&
        product.quantity >= 0 &&
        ALLOWED_UNITS.includes(product.unit)
    )
  );
}

async function parseReceiptWithAi(rawText) {
  const response = await createChatCompletionWithFallback(client, config.AI_MODEL_CHAIN, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawText },
    ],
    temperature: 0.2,
    // Gemini'nin görünür çıktıdan önceki iç muhakeme (reasoning) token'ları
    // da bu bütçeden harcanır (bkz. services/recipeAi.js, aynı durum) —
    // düşük bir değer uzun fişlerde yanıtın "length" ile yarıda kesilmesine
    // yol açar.
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InvalidAiReceiptResponseError("yanıt geçerli bir JSON değil");
  }

  if (!isValidReceiptPayload(parsed)) {
    throw new InvalidAiReceiptResponseError("products alanı eksik veya beklenen alanları içermiyor");
  }

  return parsed;
}

module.exports = { parseReceiptWithAi, InvalidAiReceiptResponseError };
