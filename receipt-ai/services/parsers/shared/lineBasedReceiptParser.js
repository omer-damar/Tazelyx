const {
  normalizeText,
  extractQuantityAndUnit,
  extractPackageWeight,
  isQuantityOnlyLine,
  cleanProductName,
} = require("./receiptTextUtils");
const {
  GENERIC_IGNORED_PATTERNS,
  GENERIC_BLACKLIST_WORDS,
} = require("./genericIgnorePatterns");

// BİM, A101, Hakmar, File ve Happy Center fişlerinin hepsi aynı temel
// satır-satır ayrıştırma mantığını kullanıyor (miktar satırı mı, ürün satırı
// mı, gürültü mü). Farklılaşan tek şey markaya özel birkaç ekstra "bu satır
// gürültü" deseni. Bu fabrika fonksiyonu, ortak mantığı tek yerde tutup her
// market dosyasının yalnızca kendi ekstra desenlerini vermesini sağlıyor.
function createLineBasedParser({
  storeIgnoredPatterns = [],
  storeBlacklistWords = [],
} = {}) {
  const ignoredPatterns = [...GENERIC_IGNORED_PATTERNS, ...storeIgnoredPatterns];
  const blacklistWords = [...GENERIC_BLACKLIST_WORDS, ...storeBlacklistWords];
  // ÖNEMLİ: kelime sınırı olmadan basit bir .includes() kontrolü, "POS"
  // kelimesinin "POSET" (poşet) içinde de eşleşmesi gibi yanlış pozitiflere
  // yol açıyordu. \b ile tam kelime eşleşmesi arıyoruz.
  const blacklistRegex = new RegExp(`\\b(${blacklistWords.join("|")})\\b`);

  function isIgnored(line) {
    return ignoredPatterns.some((pattern) => pattern.test(line));
  }

  function looksLikeRealProduct(line) {
    if (isIgnored(line)) return false;

    const cleaned = cleanProductName(line);
    if (cleaned.length < 2) return false;

    const upper = normalizeText(line).toUpperCase();
    if (blacklistRegex.test(upper)) return false;

    // en az bir harf içersin
    if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(line)) return false;

    return true;
  }

  return function parse(text) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const products = [];
    let pendingQuantity = null;

    for (const line of lines) {
      if (isIgnored(line)) continue;

      const quantityInfo = extractQuantityAndUnit(line);

      if (quantityInfo && isQuantityOnlyLine(line)) {
        pendingQuantity = quantityInfo;
        continue;
      }

      if (looksLikeRealProduct(line)) {
        const inlineQuantity = extractQuantityAndUnit(line);
        const packageWeight = extractPackageWeight(line);

        let quantity = 1;
        let unit = "adet";

        if (inlineQuantity) {
          quantity = inlineQuantity.quantity;
          unit = inlineQuantity.unit;
        } else if (pendingQuantity && pendingQuantity.unit !== "adet") {
          // Önceki satırda tam bir tartılmış miktar (kg/lt) zaten basılmış
          // (ör. tartılan meyve/sebze) — bu, isimdeki paket gramajından daha
          // güvenilir bir kaynak, doğrudan onu kullanıyoruz.
          quantity = pendingQuantity.quantity;
          unit = pendingQuantity.unit;
        } else if (packageWeight) {
          // Paketli üründe gramaj/hacim isme basılmış (ör. "500 G", "200 ML").
          // Önceki satırda gerçek bir adet sayısı varsa (ör. "2 ADET"),
          // toplam miktarı hesaplamak için bununla çarpıyoruz (2 x 45g = 90g).
          const count =
            pendingQuantity && pendingQuantity.unit === "adet" ? pendingQuantity.quantity : 1;
          quantity = Math.round(count * packageWeight.quantity * 1000) / 1000;
          unit = packageWeight.unit;
        } else if (pendingQuantity) {
          quantity = pendingQuantity.quantity;
          unit = pendingQuantity.unit;
        }

        const cleanedName = cleanProductName(line);

        if (cleanedName.length > 1) {
          products.push({ name: cleanedName, quantity, unit });
        }

        pendingQuantity = null;
      }
    }

    return products;
  };
}

module.exports = { createLineBasedParser };
