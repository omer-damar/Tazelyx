const STORE_BIM = "BIM";
const STORE_A101 = "A101";
const STORE_HAKMARKET = "HAKMARKET";
const STORE_FILE = "FILE";
const STORE_HAPPY_CENTER = "HAPPY_CENTER";
const STORE_UNKNOWN = "UNKNOWN";

// Bu desenler gerçek fiş örnekleriyle doğrulanmıştır (bkz. receipt-ai/
// sample-receipts/). File Market, BİM Birleşik Mağazalar A.Ş.'nin bir alt
// markası olduğu için kendi fişinde de "BİM BİRLEŞİK MAĞAZALAR" unvanı
// geçer — bu yüzden FILE deseni, BIM deseninden ÖNCE kontrol edilmeli,
// yoksa File fişleri yanlışlıkla düz BİM olarak sınıflandırılır.
const STORE_MARKERS = [
  {
    store: STORE_FILE,
    pattern: /BIM\s+F(İ|I)LE\s+F\d+|F(İ|I)LE\s+YEN(İ|I)|F(İ|I)LE\s+MARKET/i,
  },
  { store: STORE_HAPPY_CENTER, pattern: /HAPPY\s*CENTER/i },
  { store: STORE_A101, pattern: /A101\s+YEN(İ|I)\s+MA(Ğ|G)AZACILIK/i },
  { store: STORE_HAKMARKET, pattern: /HAKMAR/i },
  { store: STORE_BIM, pattern: /BIM\s+B(İ|I)RLE(Ş|S)IK\s+MA(Ğ|G)AZALAR/i },
];

function detectStore(text) {
  for (const { store, pattern } of STORE_MARKERS) {
    if (pattern.test(text)) {
      return store;
    }
  }

  return STORE_UNKNOWN;
}

module.exports = {
  detectStore,
  STORE_BIM,
  STORE_A101,
  STORE_HAKMARKET,
  STORE_FILE,
  STORE_HAPPY_CENTER,
  STORE_UNKNOWN,
};
