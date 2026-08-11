// NOTE: recipeAi.js constructs an OpenAI client at MODULE LOAD time, so simply
// requiring it throws "Missing credentials" when no key is configured. That is
// a design smell in its own right (see AUDIT_BACKEND.md, Quality #Q1); here we
// set a dummy key before the require so the genuinely pure export below can be
// tested. No network call is made by filterRecipesToAvailableIngredients.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key-not-used";

const {
  filterRecipesToAvailableIngredients,
} = require("../services/recipeAi");

/** Minimal recipe shaped like the validated AI payload. */
const recipe = (title, ingredients) => ({
  title,
  description: "",
  category: "Ana Yemek",
  servings: "2 kişilik",
  ingredients,
  steps: ["adım"],
  estimatedTime: "20 dk",
  tip: "",
});

const filter = (recipes, pantry) =>
  filterRecipesToAvailableIngredients({ recipes }, pantry).recipes;

describe("filterRecipesToAvailableIngredients - core behaviour", () => {
  it("keeps a recipe whose every ingredient is in the pantry", () => {
    const r = recipe("Menemen", ["3 adet domates", "2 adet biber", "2 adet yumurta"]);
    expect(filter([r], ["domates", "biber", "yumurta"])).toHaveLength(1);
  });

  it("drops a recipe that reaches for an ingredient the user does not have", () => {
    const r = recipe("Limonlu Tavuk", ["500 g tavuk", "1 adet limon"]);
    expect(filter([r], ["tavuk"])).toHaveLength(0);
  });

  it("drops the offending recipe only, keeping the compliant ones", () => {
    const ok = recipe("Domates Salatası", ["2 adet domates"]);
    const bad = recipe("Elmalı Turta", ["3 adet elma", "200 g tereyağı"]);
    expect(filter([ok, bad], ["domates", "elma"]).map((x) => x.title)).toEqual([
      "Domates Salatası",
    ]);
  });

  it("allows the configured basic staples even when not in the pantry", () => {
    const r = recipe("Haşlanmış Patates", [
      "1 kg patates",
      "1 tatlı kaşığı tuz",
      "bir tutam karabiber",
    ]);
    expect(filter([r], ["patates"])).toHaveLength(1);
  });

  it("matches across Turkish/ASCII spelling differences", () => {
    // Pantry name carries Turkish letters, the AI wrote it differently.
    const r = recipe("Soğanlı Yemek", ["2 adet sogan"]);
    expect(filter([r], ["soğan"])).toHaveLength(1);
  });

  it("matches an ingredient line that wraps the pantry name in quantities", () => {
    const r = recipe("Sütlaç", ["1 lt süt"]);
    expect(filter([r], ["süt"])).toHaveLength(1);
  });

  it("returns an empty list when the pantry is empty and staples are not enough", () => {
    const r = recipe("Bir Şey", ["1 adet elma"]);
    expect(filter([r], [])).toHaveLength(0);
  });

  it("keeps a recipe made purely of staples even with an empty pantry", () => {
    const r = recipe("Tuzlu Su", ["1 lt su", "1 çay kaşığı tuz"]);
    expect(filter([r], [])).toHaveLength(1);
  });

  it("handles an empty ingredient array (vacuously compliant)", () => {
    expect(filter([recipe("Boş", [])], ["domates"])).toHaveLength(1);
  });
});

// --- Regression coverage for AUDIT_BACKEND.md Correctness #C7 -------------
// ingredientIsAvailable() now requires the staple/pantry name to appear as a
// WHOLE WORD, not merely a substring — the two-letter staple "su" (water) no
// longer waves through unrelated words that merely contain those two letters.
describe("word-boundary staple matching rejects unrelated ingredients", () => {
  it.each([
    ["200 g sucuk", "sausage"],
    ["1 yemek kaşığı susam", "sesame"],
    ["2 adet sumak", "sumac"],
  ])("rejects %s (%s) with a completely empty pantry", (ingredient) => {
    expect(filter([recipe("X", [ingredient])], [])).toHaveLength(0);
  });

  it("still correctly authorises 'su' when it genuinely IS the ingredient", () => {
    expect(filter([recipe("Bardak Suyu", ["1 bardak su"])], [])).toHaveLength(1);
  });

  it("still correctly rejects an ingredient without those letters", () => {
    expect(filter([recipe("X", ["1 adet limon"])], [])).toHaveLength(0);
  });

  it("KNOWN LIMITATION: 'su bardağı' as a measuring unit still reads as the 'su' staple", () => {
    // "su bardağı" (~200ml) is an extremely common Turkish recipe unit, and
    // "su" genuinely appears as its own word inside it — word-boundary
    // matching can't tell "su" the unit from "su" the ingredient without
    // deeper unit-phrase parsing, which is out of scope here. Documenting
    // this as accepted behaviour rather than silently regressing on it.
    const r = recipe("X", ["1 su bardağı portakal suyu"]);
    expect(filter([r], [])).toHaveLength(1);
  });
});

// --- Regression coverage for AUDIT_BACKEND.md Correctness #C7 (2nd half) --
// The pantry comparison used to be bidirectional substring matching, which
// let short pantry names match far too much and let a vague ingredient
// piggyback on a more specific pantry item via the reverse direction. Now
// only one direction is checked, and only as a whole word.
describe("single-direction, whole-word pantry matching", () => {
  it("no longer lets the pantry item 'un' (flour) authorise unrelated words that contain it", () => {
    const r = recipe("X", ["1 somun ekmek", "1 salkım üzüm kurusu"]);
    expect(filter([r], ["un"])).toHaveLength(0);
  });

  it("no longer accepts a bare ingredient word via the reverse direction", () => {
    // "domates salçası" no longer authorises the bare word "salça".
    const r = recipe("X", ["salça"]);
    expect(filter([r], ["domates salçası"])).toHaveLength(0);
  });

  it("still authorises the exact pantry name appearing as a whole word", () => {
    const r = recipe("X", ["2 adet domates"]);
    expect(filter([r], ["domates"])).toHaveLength(1);
  });
});
