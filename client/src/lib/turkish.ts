// Türkçe metinleri karşılaştırma amacıyla ASCII'ye indirger; categorize.ts ve
// recipes.tsx'teki malzeme eşleştirmesi bu fonksiyonu paylaşır. Yalnızca iç
// karşılaştırma içindir — kaydedilen ve gösterilen adlar Türkçe karakterleri korur.
export function toAsciiLower(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}
