const config = require("../config");
const { estimateShelfLifeDaysWithAi } = require("./shelfLifeAi");

// NOT: normalizeProductName() Türkçe karakterleri her zaman ASCII karşılığına
// çevirir (ş->s, ğ->g, ü->u, ö->o, ç->c, ı->i), bu yüzden lookup HER ZAMAN
// normalize edilmiş (ASCII) bir anahtarla yapılır — tabloda yalnızca
// normalize edilmiş hâller tutulur; Türkçe karakterli bir anahtar (ör.
// "soğan") asla eşleşmeyeceği için eklenmemeli.
const shelfLifeMap = {
  patates: 30,
  domates: 7,
  salatalik: 7,
  biber: 7,
  sogan: 30,
  patlican: 7,
  elma: 30,
  muz: 5,
  portakal: 20,
  limon: 20,
  sut: 7,
  yogurt: 10,
  peynir: 14,
  yumurta: 21,
  tavuk: 3,
  nohut: 180,
  mercimek: 180,
  "mercimek yesil": 180,
  fasulye: 180,
  pirinc: 365,
  makarna: 365,
  un: 180,
  seker: 365,
  tuz: 730,
  cay: 365,
};

// ÖNEMLİ: normalizeProductName() SADECE raf ömrü tablosunda arama yapmak için
// var — Türkçe karakterleri ASCII'ye çevirdiği için KAYDEDİLEN/GÖSTERİLEN ürün
// adı için KULLANILMAMALI; kullanılırsa "İthal Muz" gibi isimler "Ithal Muz"
// olarak kaydedilir. Kaydedilen isim için Türkçe karakterleri koruyan
// cleanDisplayName() kullanılmalı.
function cleanDisplayName(name) {
  // .toLowerCase() (locale'siz) Türkçe "İ"yi "i" + ayrı bir birleşik nokta
  // karakterine çeviriyor (görünüşte aynı ama fazladan/görünmez bir Unicode
  // karakter) ve "I"yı da yanlışlıkla "i"ye çeviriyor ("MISIR" -> "misir"
  // olması gerekirken "mısır" olmalı). toLocaleLowerCase("tr") ikisini de
  // doğru yapıyor.
  return name.replace(/\s{2,}/g, " ").trim().toLocaleLowerCase("tr");
}

function normalizeProductName(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// \b...\b ile kelime sınırlı eşleşme: "karabiber" içindeki "biber"i, "somun
// ekmek" içindeki "un"u ya da "tuzlu kraker" içindeki "tuz"u YAKALAMAZ (bu
// alt-dizgeler bir kelimenin ortasında/başında geçiyor, kendi başlarına bir
// kelime değiller) — ama "1 kg domates" gibi fazladan kelime içeren
// isimlerdeki "domates"i doğru şekilde yakalar. Tablo tek seferde, modül
// yüklenirken derleniyor.
const SHELF_LIFE_PATTERNS = Object.keys(shelfLifeMap).map((key) => ({
  key,
  pattern: new RegExp(`\\b${escapeRegExp(key)}\\b`),
}));

// ÖNEMLİ: async — sabit listede (shelfLifeMap) eşleşme bulunamayan ürünler
// için AI'ya danışılır (bkz. shelfLifeAi.js). Bilinen temel ürünler için
// anında/ücretsiz döner, AI'ya sadece emin olunamadığında gidilir.
async function getEstimatedShelfLifeDays(productName) {
  const normalizedName = normalizeProductName(productName);

  // Object.hasOwn (Object.prototype üzerindeki miras alınmış "constructor",
  // "__proto__" gibi adları değil, sadece tablonun KENDİ anahtarlarını)
  // kontrol eder — düz `shelfLifeMap[normalizedName]` böyle bir üründe
  // (ör. adı "constructor" olan bir ürün) prototip zincirinde gezip bir
  // fonksiyon/obje döndürüp addDaysToDate'i Invalid Date'e düşürebilirdi.
  if (Object.hasOwn(shelfLifeMap, normalizedName)) {
    return shelfLifeMap[normalizedName];
  }

  for (const { key, pattern } of SHELF_LIFE_PATTERNS) {
    if (pattern.test(normalizedName)) {
      return shelfLifeMap[key];
    }
  }

  const aiEstimate = await estimateShelfLifeDaysWithAi(productName);
  return aiEstimate ?? config.DEFAULT_SHELF_LIFE_DAYS;
}

function addDaysToDate(baseDate, days) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

// "Bugün bozuluyor" sayılan bir ürünün effectiveExpireDate'i, ürünün
// KAYDEDİLDİĞİ saatten miras kalan bir saat bilgisi taşır (addDaysToDate
// sadece gün ekler, saat aynı kalır) — ör. sabah 10'da eklenen bir ürün
// 7 gün sonra yine sabah 10'da "bozuluyor" sayılır. Gün içinde o saat
// geçtiğinde effectiveExpireDate "şu an"dan ÖNCEYE düşer. Frontend'in
// gün-bazlı rozeti (ExpireBadge.tsx > daysUntil, Math.ceil ile) bunu yine de
// "bugün" (gün farkı 0) olarak gösterir — takvim gününe göre doğru — bu
// yüzden backend'in "yakında bozulacak" filtreleri de alt sınır olarak `now`
// yerine günün başlangıcını kullanmalı; aksi halde saniyeye kadar hassas bir
// karşılaştırma, "bugün bozulan" ürünleri o saat geçer geçmez listeden/
// panelden sessizce düşürür.
function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function buildExpireInfo(productName, manualExpireDate = null) {
  const estimatedShelfLifeDays = await getEstimatedShelfLifeDays(productName);
  const estimatedExpireDate = addDaysToDate(new Date(), estimatedShelfLifeDays);

  if (manualExpireDate) {
    const parsedManualDate = new Date(manualExpireDate);
    // PATCH /:id ve PATCH /:id/manual-expire-date bu doğrulamayı zaten
    // yapıyordu; POST / ve POST /bulk (buildProductInput üzerinden buraya
    // düşüyor) yapmıyordu — aynı geçersiz tarih (ör. "not-a-date"), ürünü
    // NASIL oluşturduğuna göre kabul edilip edilmemesi tutarsızdı.
    if (Number.isNaN(parsedManualDate.getTime())) {
      throw Object.assign(new Error("Geçersiz tarih formatı."), { status: 400 });
    }

    return {
      estimatedShelfLifeDays,
      estimatedExpireDate,
      manualExpireDate: parsedManualDate,
      effectiveExpireDate: parsedManualDate,
      expireDateSource: "manual",
    };
  }

  return {
    estimatedShelfLifeDays,
    estimatedExpireDate,
    manualExpireDate: null,
    effectiveExpireDate: estimatedExpireDate,
    expireDateSource: "estimated",
  };
}

// addDaysToDate export edilir: routes/products.js içinde bir ürünün adı
// güncellendiğinde raf ömrünü yeniden hesaplamak için kullanılır.
module.exports = {
  normalizeProductName,
  cleanDisplayName,
  getEstimatedShelfLifeDays,
  addDaysToDate,
  buildExpireInfo,
  startOfToday,
};
