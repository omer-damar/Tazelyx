// Tüm market parser'larının ortak kullandığı düşük seviye metin işlemleri:
// Türkçe karakter normalizasyonu, miktar/birim çıkarımı ve ürün adı temizliği.

function normalizeText(line) {
  return line
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c");
}

function extractQuantityAndUnit(line) {
  const normalized = normalizeText(line).toLowerCase();

  const kgMatch = normalized.match(/(\d+[.,]?\d*)\s*kg\b/);
  if (kgMatch) {
    return {
      quantity: parseFloat(kgMatch[1].replace(",", ".")),
      unit: "kg",
    };
  }

  const ltMatch = normalized.match(/(\d+[.,]?\d*)\s*(lt|l)\b/);
  if (ltMatch) {
    return {
      quantity: parseFloat(ltMatch[1].replace(",", ".")),
      unit: "lt",
    };
  }

  const adetMatch = normalized.match(/(\d+)\s*(adet|ad|lu|li)\b/);
  if (adetMatch) {
    return {
      quantity: parseInt(adetMatch[1], 10),
      unit: "adet",
    };
  }

  // A101/Happy Center/File fişlerinde birim kelimesi olmadan "9 X 14,95"
  // (9 adet, birim fiyatı 14,95) şeklinde miktar satırları da görülüyor.
  // Bu, yalnızca satırın TAMAMI bu kalıpla eşleştiğinde (bkz. isQuantityOnlyLine)
  // anlamlı, o yüzden burada da tam satır eşleşmesi aranıyor.
  const bareCountMatch = normalized.match(/^(\d+)\s*x\s*\d+[.,]\d+$/);
  if (bareCountMatch) {
    return {
      quantity: parseInt(bareCountMatch[1], 10),
      unit: "adet",
    };
  }

  return null;
}

// BİM gibi marketlerin fişlerinde, paketli/ambalajlı ürünlerde (ör. "MISIR
// GEVREĞİ 500 G", "KREMA 200 ML") gramaj/hacim bilgisi ayrı bir miktar satırı
// olarak DEĞİL, doğrudan ürün adının bir parçası olarak basılıyor — bu, o
// üründen kaç adet alındığını değil, TEK PAKETİN boyutunu gösteriyor. Bunu
// diğer birimlerden (kg/lt/adet — bunlar fişte gerçek bir satın alma miktarını
// temsil ediyor) ayrı tutuyoruz ki lineBasedReceiptParser bunu gerekirse adet
// sayısıyla çarpabilsin (ör. "2 ADET" + "45 G" -> 0.09 kg).
function extractPackageWeight(line) {
  const normalized = normalizeText(line).toLowerCase();

  const gramMatch = normalized.match(/(\d+[.,]?\d*)\s*(g|gr|gram)\b/);
  if (gramMatch) {
    return {
      quantity: Math.round((parseFloat(gramMatch[1].replace(",", ".")) / 1000) * 1000) / 1000,
      unit: "kg",
    };
  }

  const mlMatch = normalized.match(/(\d+[.,]?\d*)\s*(ml)\b/);
  if (mlMatch) {
    return {
      quantity: Math.round((parseFloat(mlMatch[1].replace(",", ".")) / 1000) * 1000) / 1000,
      unit: "lt",
    };
  }

  const clMatch = normalized.match(/(\d+[.,]?\d*)\s*(cl)\b/);
  if (clMatch) {
    return {
      quantity: Math.round((parseFloat(clMatch[1].replace(",", ".")) / 100) * 1000) / 1000,
      unit: "lt",
    };
  }

  return null;
}

function isQuantityOnlyLine(line) {
  const normalized = normalizeText(line).toLowerCase();

  return (
    /^(\d+[.,]?\d*)\s*kg\b/.test(normalized) ||
    /^(\d+[.,]?\d*)\s*(lt|l)\b/.test(normalized) ||
    /^(\d+)\s*(adet|ad|lu|li)\b/.test(normalized) ||
    /^(\d+[.,]?\d*)\s*kg\s*x\s*\d+[.,]\d+/i.test(normalized) ||
    /^(\d+)\s*x\s*\d+[.,]\d+$/.test(normalized)
  );
}

function cleanProductName(line) {
  return line
    .replace(/% ?\d+/gi, "")
    .replace(/(\d+[.,]?\d*)\s*(kg|lt|l|g|gr|gram|ml|cl|adet|ad|lu|li)\b/gi, "")
    .replace(/\*?\d+[.,]\d+/g, "")
    .replace(/x\s*\d+[.,]\d+/gi, "")
    .replace(/\bSABAN\b/gi, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLocaleLowerCase("tr");
}

module.exports = {
  normalizeText,
  extractQuantityAndUnit,
  extractPackageWeight,
  isQuantityOnlyLine,
  cleanProductName,
};
