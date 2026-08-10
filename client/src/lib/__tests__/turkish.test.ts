import { toAsciiLower } from "../turkish";

// Bu proje daha önce düz .toLowerCase() yüzünden gerçek hatalar yaşadı
// (Türkçe "İ"/"I" davranışı). Bu testler o davranışı sabitler.
describe("toAsciiLower", () => {
  it("lowercases the Turkish dotted capital İ to a plain ascii 'i'", () => {
    // JS'in düz "İ".toLowerCase()'i "i" + U+0307 (birleşik nokta) üretir;
    // sonuç görsel olarak "i" gibi görünür ama "i" ile === değildir.
    expect("İ".toLowerCase()).not.toBe("i");
    expect(toAsciiLower("İ")).toBe("i");
    expect(toAsciiLower("İZMİR")).toBe("izmir");
    expect(toAsciiLower("İncir")).toBe("incir");
  });

  it("lowercases the Turkish dotless capital I to 'i' as well", () => {
    // tr-locale'de "I".toLowerCase() -> "ı", sonra ı -> i eşlemesi devreye
    // girer. İki büyük harf de aynı ascii karşılığında buluşur.
    expect(toAsciiLower("I")).toBe("i");
    expect(toAsciiLower("IHLAMUR")).toBe("ihlamur");
    expect(toAsciiLower("Ispanak")).toBe("ispanak");
  });

  it("folds every Turkish-specific letter to its ascii counterpart", () => {
    expect(toAsciiLower("ıŞĞÜÖÇ")).toBe("isguoc");
    expect(toAsciiLower("Şeftali")).toBe("seftali");
    expect(toAsciiLower("Yoğurt")).toBe("yogurt");
    expect(toAsciiLower("Süt")).toBe("sut");
    expect(toAsciiLower("Çilek")).toBe("cilek");
    expect(toAsciiLower("Böğürtlen")).toBe("bogurtlen");
  });

  it("leaves no non-ascii characters or combining marks behind", () => {
    const folded = toAsciiLower("ÇİĞDEM ıŞıK Öğütücü");
    expect(folded).toMatch(/^[\x20-\x7e]*$/);
    expect(folded.normalize("NFD")).toBe(folded);
  });

  it("is idempotent — folding an already folded string changes nothing", () => {
    const samples = ["Süt", "İSTANBUL", "Çikolata", "bulgur", ""];
    for (const sample of samples) {
      const once = toAsciiLower(sample);
      expect(toAsciiLower(once)).toBe(once);
    }
  });

  it("preserves spacing, digits and punctuation (only case/diacritics change)", () => {
    expect(toAsciiLower("Tam Yağlı Süt 1 L")).toBe("tam yagli sut 1 l");
    expect(toAsciiLower("")).toBe("");
  });
});
