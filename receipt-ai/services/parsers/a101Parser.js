const { createLineBasedParser } = require("./shared/lineBasedReceiptParser");

// Jenerik kalıplar başlık/ödeme/kart bilgilerinin çoğunu zaten yakalar;
// burada yalnızca A101'e özgü "BÖLÜM: 0001/MARKET" satırı gibi ek bir
// gürültü kalıbı tanımlanır.
const parseA101Receipt = createLineBasedParser({
  storeIgnoredPatterns: [/^B(Ö|O)L(Ü|U)M\s*:/i],
});

module.exports = { parseA101Receipt };
