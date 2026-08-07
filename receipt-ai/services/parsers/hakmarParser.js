const { createLineBasedParser } = require("./shared/lineBasedReceiptParser");

// Hakmar'a özgü tek ek gürültü, fatura sorgulama linkini içeren satır.
const parseHakmarReceipt = createLineBasedParser({
  storeIgnoredPatterns: [/Fatura\s*Sorgu/i, /hakmarexpress/i],
});

module.exports = { parseHakmarReceipt };
