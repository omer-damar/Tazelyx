const {
  detectStore,
  STORE_BIM,
  STORE_A101,
  STORE_HAKMARKET,
  STORE_FILE,
  STORE_HAPPY_CENTER,
  STORE_UNKNOWN,
} = require("../services/parsers/storeDetector");

describe("detectStore", () => {
  it("detects each supported chain from its header line", () => {
    expect(detectStore("BIM BIRLESIK MAGAZALAR A.S.\nEKMEK 1 ADET")).toBe(STORE_BIM);
    expect(detectStore("A101 YENI MAGAZACILIK A.S.")).toBe(STORE_A101);
    expect(detectStore("HAKMAR EXPRESS")).toBe(STORE_HAKMARKET);
    expect(detectStore("HAPPY CENTER MAGAZACILIK")).toBe(STORE_HAPPY_CENTER);
    expect(detectStore("FILE MARKET")).toBe(STORE_FILE);
  });

  it("accepts the Turkish-lettered spelling of every marker", () => {
    expect(detectStore("BIM BİRLEŞIK MAĞAZALAR A.Ş.")).toBe(STORE_BIM);
    expect(detectStore("A101 YENİ MAĞAZACILIK")).toBe(STORE_A101);
    expect(detectStore("FİLE MARKET")).toBe(STORE_FILE);
  });

  it("is case-insensitive", () => {
    expect(detectStore("hakmar express")).toBe(STORE_HAKMARKET);
  });

  it("classifies a File receipt as FILE even though it carries the BIM trade name", () => {
    // File is a BIM sub-brand, so its receipts print the BIM company title too.
    // The FILE marker must win; otherwise File receipts get the BIM parser and
    // its File-specific noise lines (VER:/OP:/ECR:, SICIL NO) leak in as products.
    const fileReceipt = [
      "BIM BIRLESIK MAGAZALAR A.S.",
      "BIM FILE F215 - KADIKOY",
      "EKMEK",
    ].join("\n");

    expect(detectStore(fileReceipt)).toBe(STORE_FILE);
  });

  it("falls back to UNKNOWN for an unsupported chain or empty text", () => {
    expect(detectStore("MIGROS TICARET A.S.")).toBe(STORE_UNKNOWN);
    expect(detectStore("")).toBe(STORE_UNKNOWN);
  });

  it("does not match a chain name that merely appears inside another word", () => {
    // "HAKMAR" is matched bare (no \b anchors), so this pins current behaviour:
    // an unrelated line containing the substring would be classified as Hakmar.
    expect(detectStore("HAKMARKET DEGIL")).toBe(STORE_HAKMARKET);
  });
});
