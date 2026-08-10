import { toAsciiLower } from "./turkish";

// Backend'deki Product modelinde "category" alanı yok; kategori burada
// client-side anahtar kelime eşleştirmesiyle tahmin ediliyor (receipt-ai/
// services/shelfLife.js'teki shelfLifeMap'e benzer bir yaklaşım). Kesin veya
// kullanıcı tanımlı kategori gerekirse ileride gerçek bir alan eklenebilir.
const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  {
    category: "Süt Ürünleri",
    keywords: ["sut", "yogurt", "peynir", "krema", "tereyag", "kefir", "ayran"],
  },
  {
    category: "Meyve & Sebze",
    keywords: [
      "domates",
      "salatalik",
      "biber",
      "sogan",
      "patates",
      "patlican",
      "elma",
      "muz",
      "portakal",
      "limon",
      "havuc",
      "marul",
      "sarimsak",
    ],
  },
  { category: "Et & Tavuk", keywords: ["tavuk", "kiyma", "et", "sucuk", "sosis", "balik"] },
  {
    category: "Bakliyat & Tahıl",
    keywords: ["nohut", "mercimek", "fasulye", "pirinc", "makarna", "un", "bulgur"],
  },
  {
    category: "Atıştırmalık",
    keywords: ["cikolata", "kek", "kraker", "sakiz", "bisküvi", "gevrek", "seker"],
  },
  { category: "İçecek", keywords: ["su", "cay", "kahve", "meyve suyu", "kola", "gazoz"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Anahtar kelimeler burada, tek seferde, ASCII'ye katlanmış hâliyle
// derleniyor — karşılaştırma zaten toAsciiLower(name) ile ASCII'ye katlanmış
// bir metne karşı yapılıyordu, ama anahtarların kendisi (ör. "bisküvi")
// katlanmamıştı ve hiçbir zaman eşleşemiyordu.
//
// Eşleşme deseni \bKEYWORD\w{0,2}\b: kelime SOLDAN bir sınırla başlamak
// zorunda (bu, "et"in "deterjan"/"peçete" içinde ya da "un"un "sabun"
// içinde bir alt-dizge olarak yakalanmasını engelliyor), ama sağda en
// fazla 2 harflik bir ek toleransı var — Türkçe eklemeli bir dil olduğu
// için "tereyağı" ("tereyağ" + hâl eki "ı") gibi meşru çekimli biçimlerin
// hâlâ doğru kategoriye düşmesi gerekiyor. Bu tolerans "susam"ın "su"
// anahtarına (3 harflik fazlalık: "sam") yanlışlıkla düşmesini engelleyecek
// kadar sıkı.
const SUFFIX_TOLERANCE = 2;
const CATEGORY_MATCHERS = CATEGORY_KEYWORDS.map(({ category, keywords }) => ({
  category,
  patterns: keywords.map(
    (keyword) =>
      new RegExp(`\\b${escapeRegExp(toAsciiLower(keyword))}\\w{0,${SUFFIX_TOLERANCE}}\\b`)
  ),
}));

export function categorizeProduct(name: string): string {
  const normalized = toAsciiLower(name);

  for (const { category, patterns } of CATEGORY_MATCHERS) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      return category;
    }
  }

  return "Diğer";
}
