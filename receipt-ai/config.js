// Proje genelinde kullanılan sabit değerler.
// Amaç: aynı değerin (örn. "yakında bozulacak" eşiği) birden fazla
// dosyada tekrar tekrar hardcoded yazılmasını önlemek.

// Sağlayıcıdan bağımsız AI istemci ayarları. AI_PROVIDER'ı (ve ilgili API
// anahtarını) .env üzerinden değiştirerek services/recipeAi.js'e hiç
// dokunmadan Gemini/Groq/OpenAI arasında geçiş yapılabilir — ileride
// kullanıcı planına göre model seçimi (ücretsiz/Pro) eklenecekse de tek
// genişletme noktası burası.
const AI_PROVIDER = process.env.AI_PROVIDER || "gemini";

// Her sağlayıcının, birincil model dolu/aşırı yüklüyse sırayla denenecek
// bir "yedek model zinciri" var. gemini-flash-latest gibi bir "latest"
// takma adı en yeni (ve genelde en düşük ücretsiz günlük kotalı) modele
// işaret ediyor — o kota dolunca bir öncekine, o da dolunca ondan bir
// öncekine düşülüyor. Groq/OpenAI'da şimdilik tek model yeterli (Groq'un
// ücretsiz kotası zaten yüksek, OpenAI'a bu projede geçilmeyecek).
const AI_PROVIDER_PRESETS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY,
    modelChain: process.env.AI_MODEL
      ? [process.env.AI_MODEL]
      : ["gemini-flash-latest", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    modelChain: [process.env.AI_MODEL || "llama-3.3-70b-versatile"],
  },
  openai: {
    baseURL: undefined,
    apiKey: process.env.OPENAI_API_KEY,
    modelChain: [process.env.AI_MODEL || "gpt-4.1-mini"],
  },
};

const activeAiPreset = AI_PROVIDER_PRESETS[AI_PROVIDER] || AI_PROVIDER_PRESETS.gemini;
// .env > AI_MODEL_CHAIN, virgülle ayrılmış bir liste olarak yukarıdaki
// varsayılan zincirin tamamını override edebilir (ör. farklı bir sıra ya
// da farklı modeller denemek için kod değişikliği gerekmesin diye).
const modelChain = process.env.AI_MODEL_CHAIN
  ? process.env.AI_MODEL_CHAIN.split(",").map((m) => m.trim()).filter(Boolean)
  : activeAiPreset.modelChain;

module.exports = {
  // Bir ürün, son kullanma tarihine kaç gün kala "yakında bozulacak" sayılır
  EXPIRING_SOON_DAYS: 3,

  // Raf ömrü tablosunda eşleşme bulunamazsa kullanılacak varsayılan gün sayısı
  DEFAULT_SHELF_LIFE_DAYS: 7,

  // Fiş yükleme sırasında izin verilen maksimum dosya boyutu (MB)
  UPLOAD_MAX_FILE_SIZE_MB: 10,

  // Fiş yükleme sırasında izin verilen dosya türleri
  ALLOWED_UPLOAD_MIME_TYPES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ],

  // Tarif önerisinde, kilerde takip edilmese bile neredeyse her mutfakta
  // hazır bulunduğu varsayılan temel malzemeler. AI, tariflerinde SADECE
  // kilerdeki ürünleri ve bu listeyi kullanabilir — bkz. services/recipeAi.js
  // içindeki filterRecipesToAvailableIngredients.
  BASIC_PANTRY_STAPLES: ["tuz", "karabiber", "su", "sivi yag"],

  // Sistemin (parser'lar, raf ömrü hesaplama, özet gruplama) anlayabildiği
  // tek birim kümesi. Manuel ürün eklemede kullanıcı "Kg"/"litre" gibi farklı
  // yazımlar girerse services/productValidation.js bunu normalize edip bu
  // listeyle karşılaştırıyor.
  ALLOWED_UNITS: ["kg", "lt", "adet"],

  AI_PROVIDER,
  AI_BASE_URL: activeAiPreset.baseURL,
  AI_API_KEY: activeAiPreset.apiKey,
  // Geriye dönük uyumluluk için: zincirdeki İLK model. Yeni kod
  // AI_MODEL_CHAIN'i kullanmalı.
  AI_MODEL: modelChain[0],
  AI_MODEL_CHAIN: modelChain,

  // E-posta onayı henüz frontend'de karşılık bir ekranı olmadığı için
  // doğrudan backend'in kendi uç noktasına işaret ediyor (GET, tarayıcıda
  // açılınca JSON dönüyor — kabul edilebilir, kullanıcı sadece linke tıklayıp
  // onaylanıyor).
  APP_BASE_URL: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,

  // Şifre sıfırlama linki ise gerçek bir form gerektiriyor (yeni şifreyi
  // girmek için), bu yüzden backend'e değil doğrudan Expo Go'da çalışan
  // uygulamaya (client/src/app/(auth)/reset-password.tsx) yönlendiriliyor.
  // "exp://<lan-ip>:8081" — Metro'nun QR ile bağlanmakta kullanılan aynı
  // adresi (bkz. client tarafındaki API_BASE_URL) — Wi-Fi ağı değişirse
  // burası da güncellenmeli.
  EXPO_APP_URL: process.env.EXPO_APP_URL || "exp://192.168.1.107:8081",
  EMAIL_TOKEN_EXPIRES_MS: 24 * 60 * 60 * 1000, // 24 saat
  PASSWORD_RESET_TOKEN_EXPIRES_MS: 60 * 60 * 1000, // 1 saat

  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD,
  // Giden e-postalarda gösterilen gönderen adı — kişisel/proje adı değil,
  // markanın kendisi ("Tazelyx") olsun diye ayrı bir config değeri.
  EMAIL_SENDER_NAME: process.env.EMAIL_SENDER_NAME || "Tazelyx",

  // Tarif önerilerinin yanına GERÇEK bir kaynak linki eklemek için
  // (bkz. services/recipeSearch.js) — Tavily'nin ücretsiz kotası (ayda 1000
  // arama) bu projenin ölçeği için yeterli olmalı. Anahtar yoksa özellik
  // sessizce devre dışı kalır (tarifler linksiz gösterilir, hata vermez).
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,

  // İsraf Skoru: üstel-sönümlü ağırlıklı oran modelinin sönüm katsayısı
  // (~15 günlük yarı ömre denk geliyor) — bkz. services/wasteScore.js
  WASTE_SCORE_DECAY: 0.955,

  // Kurtarma bonusu: ürün bozulmadan hemen önce tüketilirse ana skora
  // eklenen küçük ek puan (olay başına), toplamda sınırlı bir tavanla.
  RESCUE_BONUS_PER_EVENT: 0.5,
  RESCUE_BONUS_CAP: 5,

  // Tüketim hızı tahmini (bkz. services/consumptionPrediction.js): bir
  // ürün, tahmini kalan gün sayısı bu değere eşit veya altına düştüğünde
  // "tükenmek üzere" sayılır.
  RUNNING_LOW_DAYS: 1,

  // Güvenilir bir tüketim hızı hesaplayabilmek için bir ürünün en az kaç
  // gündür gözlemleniyor (ilk tüketim/miktar-azaltma logundan bugüne)
  // olması gerektiği — çok yeni eklenmiş bir ürün için tek bir olaydan
  // abartılı bir hız çıkarılmasın diye.
  MIN_CONSUMPTION_OBSERVATION_DAYS: 2,
};
