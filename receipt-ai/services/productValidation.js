const config = require("../config");

// "unit" alanı normalize edilir: fiş parser'ları hep küçük harfle
// ("kg"/"lt"/"adet") kaydeder, ama manuel ürün eklemede kullanıcı "Kg"/
// "KG"/"litre" gibi farklı bir şey girebilir. Normalize edilmezse aynı ürün
// services/productQueries.js > getProductSummaryByName() içinde farklı
// birim yüzünden ayrı bir satıra düşer.
function normalizeUnit(unit) {
  return String(unit).trim().toLowerCase();
}

function isValidUnit(unit) {
  return config.ALLOWED_UNITS.includes(unit);
}

module.exports = { normalizeUnit, isValidUnit };
