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

export function categorizeProduct(name: string): string {
  const normalized = toAsciiLower(name);

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }

  return "Diğer";
}
