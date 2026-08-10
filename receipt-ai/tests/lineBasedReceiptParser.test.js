const {
  createLineBasedParser,
} = require("../services/parsers/shared/lineBasedReceiptParser");
const { parseBimReceipt } = require("../services/parsers/bimParser");
const { parseReceiptText } = require("../services/parsers");
const { UnsupportedStoreError } = require("../services/parsers/UnsupportedStoreError");

const parse = createLineBasedParser();

describe("createLineBasedParser - quantity resolution", () => {
  it("defaults to 1 adet when a product line carries no quantity signal", () => {
    expect(parse("EKMEK")).toEqual([{ name: "ekmek", quantity: 1, unit: "adet" }]);
  });

  it("uses an inline quantity printed on the product line itself", () => {
    expect(parse("SUT 1 LT")).toEqual([{ name: "sut", quantity: 1, unit: "lt" }]);
  });

  it("carries a preceding weighed line onto the following product", () => {
    const text = ["0,745 KG X 34,90", "DOMATES"].join("\n");
    expect(parse(text)).toEqual([{ name: "domates", quantity: 0.745, unit: "kg" }]);
  });

  it("multiplies a preceding piece count by the printed package weight", () => {
    // "2 ADET" + "45 G" must become 0.09 kg, not 2 adet and not 0.045 kg.
    const text = ["2 ADET", "BISKUVI 45 G"].join("\n");
    expect(parse(text)).toEqual([{ name: "bıskuvı", quantity: 0.09, unit: "kg" }]);
  });

  it("prefers a preceding weighed amount over the package size on the name", () => {
    // A printed kg figure is a real purchase amount; a package size is not.
    const text = ["1,2 KG X 20,00", "PEYNIR 500 G"].join("\n");
    expect(parse(text)).toEqual([{ name: "peynır", quantity: 1.2, unit: "kg" }]);
  });

  it("does not leak a pending quantity onto a later unrelated product", () => {
    const text = ["3 ADET", "ELMA 1 KG", "EKMEK"].join("\n");
    expect(parse(text)).toEqual([
      { name: "elma", quantity: 1, unit: "kg" },
      { name: "ekmek", quantity: 1, unit: "adet" },
    ]);
  });

  it("rounds package-weight multiplication to 3 decimals", () => {
    const text = ["3 ADET", "CIKOLATA 35 G"].join("\n");
    const [item] = parse(text);
    expect(item.quantity).toBeCloseTo(0.105, 5);
    expect(item.unit).toBe("kg");
  });
});

describe("createLineBasedParser - noise filtering", () => {
  it("drops totals, tax, payment and identity lines", () => {
    const noise = [
      "ARA TOPLAM",
      "TOPLAM 145,50",
      "KDV ORANI %8",
      "KREDI KARTI",
      "TCKN/VKN 11111111111",
      "NIHAI TUKETICI",
      "KASIYER: AHMET",
      "TARIH 01.02.2026",
      "12:45",
      "1234567890123",
      "TESEKKUR EDERIZ",
      "VERGI DAIRESI KADIKOY",
    ].join("\n");

    expect(parse(noise)).toEqual([]);
  });

  it("drops address and company-title lines", () => {
    const noise = [
      "ATATURK MAH. CUMHURIYET CAD. NO:5",
      "SANAYI VE TICARET A.S.",
      "LTD. ŞTİ.",
      "34785 ISTANBUL",
    ].join("\n");

    expect(parse(noise)).toEqual([]);
  });

  // --- BUG (see AUDIT_BACKEND.md, Correctness #C3) ------------------------
  // genericIgnorePatterns.js consistently spells its patterns with an ASCII
  // fallback -- /TE(Ş|S)EKK(Ü|U)R/, /KAS(İ|I)YER/, /^SATI(Ş|S)\b/ and ~30 more
  // -- because Vision OCR routinely returns "S" for "Ş". Exactly two patterns
  // forgot to: /A\.?\s?Ş\.?\s*$/ (line 8) and /LTD\.?\s*Ş(Tİ|TI)\.?/ (line 9).
  // isIgnored() also tests the RAW line, never normalizeText(line), so there is
  // no second chance. Result: an OCR'd company-title line leaks into the pantry
  // as a product. These two tests assert the CURRENT BROKEN behaviour and will
  // fail (telling you to update them) once the patterns are fixed.
  it("BUG: an ASCII-OCR'd 'A.S.' company title leaks in as a product", () => {
    expect(parse("ORNEK GIDA A.S.")).toEqual([
      { name: "ornek gıda a s", quantity: 1, unit: "adet" },
    ]);
    // The Turkish spelling on the very same line is filtered correctly.
    expect(parse("ORNEK GIDA A.Ş.")).toEqual([]);
  });

  it("BUG: an ASCII-OCR'd 'LTD. STI.' company title leaks in as a product", () => {
    expect(parse("LTD. STI.")).toEqual([
      { name: "ltd stı", quantity: 1, unit: "adet" },
    ]);
    expect(parse("LTD. ŞTİ.")).toEqual([]);
  });

  it("drops the shopping-bag charge, which is not a pantry item", () => {
    expect(parse("POSET")).toEqual([]);
    expect(parse("TORBA")).toEqual([]);
  });

  it("keeps POSET-like real products that merely start with the blacklisted POS word", () => {
    // The blacklist uses \b anchors precisely so "POS" does not swallow other
    // words; verify a product containing "POS" as a substring still survives.
    expect(parse("KOMPOSTO")).toEqual([
      { name: "komposto", quantity: 1, unit: "adet" },
    ]);
  });

  it("drops lines with no letters at all", () => {
    expect(parse("*24,90")).toEqual([]);
    expect(parse("123456")).toEqual([]);
  });

  it("ignores blank lines and surrounding whitespace", () => {
    expect(parse("\n\n   EKMEK   \n\n")).toEqual([
      { name: "ekmek", quantity: 1, unit: "adet" },
    ]);
  });

  it("returns an empty array for empty or whitespace-only OCR text", () => {
    expect(parse("")).toEqual([]);
    expect(parse("   \n  \n ")).toEqual([]);
  });

  it("drops names that clean down to fewer than two characters", () => {
    expect(parse("A 1 KG")).toEqual([]);
  });
});

describe("createLineBasedParser - store-specific extension", () => {
  it("applies store-specific ignore patterns on top of the generic ones", () => {
    const withStorePattern = createLineBasedParser({
      storeIgnoredPatterns: [/^BOLUM\s*:/i],
    });

    expect(withStorePattern("BOLUM: 0001/MARKET")).toEqual([]);
    // The same line survives the generic-only parser, proving the extension
    // point is what removed it.
    expect(parse("BOLUM: 0001/MARKET").length).toBeGreaterThan(0);
  });

  it("bimParser strips the BIM store title anywhere on the line", () => {
    expect(parseBimReceipt("BIM BIRLESIK MAGAZALAR A.S SUBE 123")).toEqual([]);
    expect(parseBimReceipt("GS No 4471")).toEqual([]);
  });
});

describe("parseReceiptText dispatch", () => {
  it("parses a realistic BIM receipt end to end", () => {
    const receipt = [
      "BIM BIRLESIK MAGAZALAR A.S.",
      "ATATURK MAH. CUMHURIYET CAD.",
      "TARIH 01.02.2026",
      "FIS NO 0123",
      "SUT 1 LT",
      "0,745 KG X 34,90",
      "DOMATES",
      "2 ADET",
      "BISKUVI 45 G",
      "ARA TOPLAM",
      "TOPLAM 145,50",
      "KREDI KARTI",
      "TESEKKUR EDERIZ",
    ].join("\n");

    expect(parseReceiptText(receipt)).toEqual([
      { name: "sut", quantity: 1, unit: "lt" },
      { name: "domates", quantity: 0.745, unit: "kg" },
      { name: "bıskuvı", quantity: 0.09, unit: "kg" },
    ]);
  });

  it("throws UnsupportedStoreError for an unrecognised chain", () => {
    expect(() => parseReceiptText("MIGROS TICARET A.S.\nEKMEK")).toThrow(
      UnsupportedStoreError
    );
    expect(() => parseReceiptText("MIGROS TICARET A.S.")).toThrow(/UNKNOWN/);
  });

  it("throws UnsupportedStoreError rather than returning [] for empty text", () => {
    expect(() => parseReceiptText("")).toThrow(UnsupportedStoreError);
  });
});
