const { createLineBasedParser } = require("./shared/lineBasedReceiptParser");

// File Market, BİM Birleşik Mağazalar A.Ş.'nin bir alt markası — fiş formatı
// BİM ile birebir aynı (bkz. bimParser.js). Fişin başında "FİLE ..." şube
// satırı, sonunda ise "BIM FİLE F215 - ..." şube kodu ve File'a özgü birkaç
// POS/adres satırı bulunur.
const parseFileReceipt = createLineBasedParser({
  storeIgnoredPatterns: [
    /^F(İ|I)LE\s+YEN(İ|I)|^F(İ|I)LE\s+MARKET/i,
    /BIM\s+F(İ|I)LE\s+F\d+/i,
    /MERKEZ\s*ADRES(İ|I)/i,
    /S(İ|I)C(İ|I)L\s*NO/i,
    /^VER:.*OP:.*ECR:/i,
  ],
});

module.exports = { parseFileReceipt };
