const { createLineBasedParser } = require("./shared/lineBasedReceiptParser");

// Happy Center'a özgü ek gürültü kalıpları; format jenerik altyapıyla büyük
// ölçüde örtüştüğü için yalnızca şube/kart satırları ek olarak filtrelenir.
const parseHappyCenterReceipt = createLineBasedParser({
  storeIgnoredPatterns: [/^(Ş|S)ube\s*T(İ|I)C/i, /KART\s*NO\s*:\s*>/i],
});

module.exports = { parseHappyCenterReceipt };
