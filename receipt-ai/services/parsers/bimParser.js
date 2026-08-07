const { createLineBasedParser } = require("./shared/lineBasedReceiptParser");

// BİM'e özel, jenerik kalıplarla yakalanmayan tek şey şubeye özgü "GS No"
// kodu ve "5901," ile başlayan şube/adres kısayolu.
const parseBimReceipt = createLineBasedParser({
  storeIgnoredPatterns: [
    /^GS No/i,
    /^5901,/i,
    // Fişin başındaki mağaza unvanı ("BİM BİRLEŞİK MAĞAZALAR A.Ş") — jenerik
    // "... A.Ş" deseni satır sonuna bağımlı olduğu için OCR'ın satır sonuna
    // ek bir şey eklediği durumlarda kaçırabiliyordu, bu yüzden BİM'in tam
    // unvanını da ayrıca (satırın herhangi bir yerinde) yakalıyoruz.
    /B(İ|I)M\s+B(İ|I)RLE(Ş|S)(İ|I)K\s+MA(Ğ|G)AZALAR/i,
  ],
});

module.exports = { parseBimReceipt };
