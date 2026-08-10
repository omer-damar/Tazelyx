const {
  normalizeText,
  extractQuantityAndUnit,
  extractPackageWeight,
  isQuantityOnlyLine,
  cleanProductName,
} = require("../services/parsers/shared/receiptTextUtils");

describe("normalizeText", () => {
  it("maps every Turkish-specific letter to its ASCII counterpart", () => {
    expect(normalizeText("İŞĞÜÖÇ")).toBe("ISGUOC");
    expect(normalizeText("ışğüöç")).toBe("isguoc");
  });

  it("uppercases dotted-I to plain I so blacklist matching is locale-safe", () => {
    // The blacklist regex in lineBasedReceiptParser tests normalizeText(line)
    // .toUpperCase(); if "İ" survived, "FİŞ" would never match the "FIS" word.
    expect(normalizeText("FİŞ").toUpperCase()).toBe("FIS");
  });

  it("leaves ASCII text untouched", () => {
    expect(normalizeText("EKMEK 500 G")).toBe("EKMEK 500 G");
  });
});

describe("extractQuantityAndUnit", () => {
  it("reads weighed kg amounts, accepting comma as the decimal separator", () => {
    expect(extractQuantityAndUnit("0,745 KG X 34,90")).toEqual({
      quantity: 0.745,
      unit: "kg",
    });
    expect(extractQuantityAndUnit("2.5 kg")).toEqual({ quantity: 2.5, unit: "kg" });
  });

  it("reads litre amounts written as both 'lt' and bare 'l'", () => {
    expect(extractQuantityAndUnit("5 LT")).toEqual({ quantity: 5, unit: "lt" });
    expect(extractQuantityAndUnit("1,5 L")).toEqual({ quantity: 1.5, unit: "lt" });
  });

  it("reads piece counts from adet/ad/lu/li suffixes", () => {
    expect(extractQuantityAndUnit("2 ADET")).toEqual({ quantity: 2, unit: "adet" });
    expect(extractQuantityAndUnit("6 LU")).toEqual({ quantity: 6, unit: "adet" });
  });

  it("reads the bare '<count> X <unit price>' form only as a whole line", () => {
    expect(extractQuantityAndUnit("9 X 14,95")).toEqual({ quantity: 9, unit: "adet" });
    // Anchored with ^...$, so the same shape embedded in a product line is not
    // mistaken for a standalone quantity line.
    expect(extractQuantityAndUnit("SUCUK 9 X 14,95 TL")).toBeNull();
  });

  it("prefers kg over lt when a line somehow carries both", () => {
    expect(extractQuantityAndUnit("1 KG 2 LT")).toEqual({ quantity: 1, unit: "kg" });
  });

  it("returns null for lines with no quantity at all", () => {
    expect(extractQuantityAndUnit("TAM BUGDAY EKMEGI")).toBeNull();
    expect(extractQuantityAndUnit("")).toBeNull();
  });

  it("does not mistake a 'TL' total line for a litre amount", () => {
    expect(extractQuantityAndUnit("TOPLAM 145,50 TL")).toBeNull();
  });
});

describe("extractPackageWeight", () => {
  it("converts printed package grams to kg", () => {
    expect(extractPackageWeight("MISIR GEVREGI 500 G")).toEqual({
      quantity: 0.5,
      unit: "kg",
    });
    expect(extractPackageWeight("BISKUVI 45 GR")).toEqual({ quantity: 0.045, unit: "kg" });
  });

  it("converts printed millilitres and centilitres to lt", () => {
    expect(extractPackageWeight("KREMA 200 ML")).toEqual({ quantity: 0.2, unit: "lt" });
    expect(extractPackageWeight("SODA 33 CL")).toEqual({ quantity: 0.33, unit: "lt" });
  });

  it("does not treat a weighed 'kg' line as a package gram figure", () => {
    // "3 KG" must not match the /(\d+)\s*(g|gr|gram)\b/ branch.
    expect(extractPackageWeight("DOMATES 3 KG")).toBeNull();
  });

  it("returns null when no package size is printed", () => {
    expect(extractPackageWeight("YOGURT")).toBeNull();
  });
});

describe("isQuantityOnlyLine", () => {
  it("accepts lines that start with a standalone quantity", () => {
    expect(isQuantityOnlyLine("0,745 KG X 34,90")).toBe(true);
    expect(isQuantityOnlyLine("2 ADET")).toBe(true);
    expect(isQuantityOnlyLine("9 X 14,95")).toBe(true);
  });

  it("rejects product lines that merely contain a quantity", () => {
    expect(isQuantityOnlyLine("ELMA 2 KG")).toBe(false);
    expect(isQuantityOnlyLine("SUT 1 LT")).toBe(false);
  });
});

describe("cleanProductName", () => {
  it("strips quantities, prices, percentages and punctuation", () => {
    expect(cleanProductName("*TAM YAGLI SUT 1 LT %18 24,90")).toBe("tam yaglı sut");
  });

  it("lowercases with Turkish locale rules, not the default locale", () => {
    // toLocaleLowerCase("tr") maps I -> ı and İ -> i. Default toLowerCase()
    // would give "misir" for MISIR (wrong) and would leave "İ" as "i" plus a
    // separate combining dot (an invisible extra code point).
    expect(cleanProductName("MISIR")).toBe("mısır");
    expect(cleanProductName("İTHAL MUZ")).toBe("ithal muz");
    expect(cleanProductName("İTHAL MUZ")).toHaveLength("ithal muz".length);
    expect("İTHAL".toLowerCase()).toHaveLength(6); // the bug being avoided
  });

  it("REGRESSION: Turkish-locale lowercasing dots-down every ASCII I in OCR text", () => {
    // Documents a real limitation rather than asserting desired behaviour.
    // Vision OCR often returns "GEVREGI" for "GEVREĞİ" (Turkish diacritics
    // lost). Turkish-locale lowercasing then maps that I to "ı", so the stored
    // display name becomes "gevregı" -- a dotless ı where a dotted i belongs.
    // Harmless for shelf-life lookup (normalizeProductName folds ı -> i), but
    // it is why receipt-sourced names can read slightly misspelled in the UI.
    expect(cleanProductName("MISIR GEVREGI")).toBe("mısır gevregı");
  });

  it("collapses the whitespace left behind by stripped tokens", () => {
    expect(cleanProductName("KREMA   200 ML")).toBe("krema");
  });

  it("preserves Turkish letters in the product name", () => {
    expect(cleanProductName("BEYAZ PEYNİR 500 G")).toBe("beyaz peynir");
  });
});
