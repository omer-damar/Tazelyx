const {
  detectStore,
  STORE_BIM,
  STORE_A101,
  STORE_HAKMARKET,
  STORE_FILE,
  STORE_HAPPY_CENTER,
} = require("./storeDetector");
const { parseBimReceipt } = require("./bimParser");
const { parseA101Receipt } = require("./a101Parser");
const { parseHakmarReceipt } = require("./hakmarParser");
const { parseFileReceipt } = require("./fileParser");
const { parseHappyCenterReceipt } = require("./happyCenterParser");
const { UnsupportedStoreError } = require("./UnsupportedStoreError");

// Yeni bir market eklemek için:
// 1) storeDetector.js'e o markete özel, ayırt edici bir desen ekle
// 2) parsers/ altında o markete özel bir parser dosyası oluştur (bimParser.js gibi)
// 3) aşağıdaki switch'e bir case ekle
function parseReceiptText(text) {
  const store = detectStore(text);

  switch (store) {
    case STORE_BIM:
      return parseBimReceipt(text);
    case STORE_A101:
      return parseA101Receipt(text);
    case STORE_HAKMARKET:
      return parseHakmarReceipt(text);
    case STORE_FILE:
      return parseFileReceipt(text);
    case STORE_HAPPY_CENTER:
      return parseHappyCenterReceipt(text);
    default:
      throw new UnsupportedStoreError(store);
  }
}

module.exports = { parseReceiptText, UnsupportedStoreError };
