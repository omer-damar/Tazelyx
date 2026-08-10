import { categorizeProduct } from "../categorize";

describe("categorizeProduct", () => {
  it("maps well-known products to their category", () => {
    expect(categorizeProduct("Süt")).toBe("Süt Ürünleri");
    expect(categorizeProduct("Domates")).toBe("Meyve & Sebze");
    expect(categorizeProduct("Tavuk")).toBe("Et & Tavuk");
    expect(categorizeProduct("Mercimek")).toBe("Bakliyat & Tahıl");
    expect(categorizeProduct("Çikolata")).toBe("Atıştırmalık");
    expect(categorizeProduct("Kahve")).toBe("İçecek");
  });

  it("is case- and diacritic-insensitive (fiş isimleri hep BÜYÜK harf gelir)", () => {
    expect(categorizeProduct("YOĞURT")).toBe("Süt Ürünleri");
    expect(categorizeProduct("yogurt")).toBe("Süt Ürünleri");
    expect(categorizeProduct("PATLICAN")).toBe("Meyve & Sebze");
    expect(categorizeProduct("Pirinç")).toBe("Bakliyat & Tahıl");
    expect(categorizeProduct("PİRİNÇ")).toBe("Bakliyat & Tahıl");
  });

  it("matches keywords inside longer receipt-style product names", () => {
    expect(categorizeProduct("Tam Yağlı Süt 1L")).toBe("Süt Ürünleri");
    expect(categorizeProduct("Beyaz Peynir 500 g")).toBe("Süt Ürünleri");
    expect(categorizeProduct("Tavuk Göğsü Kg")).toBe("Et & Tavuk");
  });

  it("falls back to 'Diğer' for unknown products and empty input", () => {
    expect(categorizeProduct("Zeytinyağı")).toBe("Diğer");
    expect(categorizeProduct("Tuz")).toBe("Diğer");
    expect(categorizeProduct("")).toBe("Diğer");
    expect(categorizeProduct("   ")).toBe("Diğer");
  });

  it("resolves multi-category matches by keyword-list order, not by best match", () => {
    // "sucuk" hem Et & Tavuk'un "sucuk" anahtarına hem de İçecek'in "su"
    // anahtarına uyar. CATEGORY_KEYWORDS sırası kazanır; Et & Tavuk önce
    // geldiği için doğru sonucu verir.
    expect(categorizeProduct("Sucuk")).toBe("Et & Tavuk");
    // "tereyağı" da hem Süt Ürünleri'nin "tereyag"ına hem Et & Tavuk'un
    // "et"ine uyar — Süt Ürünleri önce tanımlı olduğu için o kazanır.
    expect(categorizeProduct("Tereyağı")).toBe("Süt Ürünleri");
  });

  // --- Aşağıdakiler, AUDIT_FRONTEND.md'de bulunup düzeltilen iki kusurun
  // regresyon testleridir (önceden "KNOWN BUG" olarak mevcut hatalı
  // davranışı sabitliyordu; artık doğru davranışı doğruluyor).
  it("word-boundary matching no longer misfires on short keywords inside unrelated words", () => {
    // "et" anahtarı artık sadece TAM kelime olarak eşleşiyor; "deterjan" ve
    // "peçete" içindeki alt-dizge olarak eşleşmiyor.
    expect(categorizeProduct("Deterjan")).toBe("Diğer");
    expect(categorizeProduct("Peçete")).toBe("Diğer");
    // "un" anahtarı da aynı şekilde: "sabun" artık yanlışlıkla Bakliyat &
    // Tahıl'a düşmüyor.
    expect(categorizeProduct("Sabun")).toBe("Diğer");
    // "su" anahtarı: "susam" artık yanlışlıkla İçecek'e düşmüyor.
    expect(categorizeProduct("Susam")).toBe("Diğer");
  });

  it("the 'bisküvi' keyword now matches after being ascii-folded at load time", () => {
    expect(categorizeProduct("Bisküvi")).toBe("Atıştırmalık");
    expect(categorizeProduct("BISKUVI")).toBe("Atıştırmalık");
  });
});
