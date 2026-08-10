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

// --- BUG (see AUDIT_BACKEND.md, Correctness #C7) --------------------------
// ingredientIsAvailable() tests `normalizedIngredient.includes(staple)` with no
// word boundary. config.BASIC_PANTRY_STAPLES contains the two-letter word "su",
// which is a substring of a great many Turkish food words. Any ingredient
// containing those two letters is waved through as if it were tap water, which
// defeats the "last line of defence" this filter is documented to be.
describe("BUG: the two-letter 'su' staple waves through unrelated ingredients", () => {
  it.each([
    ["200 g sucuk", "sausage"],
    ["1 yemek kaşığı susam", "sesame"],
    ["1 su bardağı portakal suyu", "orange juice"],
    ["2 adet sumak", "sumac"],
  ])("accepts %s (%s) with a completely empty pantry", (ingredient) => {
    expect(filter([recipe("X", [ingredient])], [])).toHaveLength(1);
  });

  it("lets a whole hallucinated recipe survive on 'su' substrings alone", () => {
    const r = recipe("Hayali Yemek", ["200 g sucuk", "1 kaşık susam", "1 su"]);
    expect(filter([r], [])).toHaveLength(1);
  });

  it("still correctly rejects an ingredient without those letters", () => {
    // Confirms the filter is not simply accepting everything.
    expect(filter([recipe("X", ["1 adet limon"])], [])).toHaveLength(0);
  });
});

// --- BUG (same finding, second half) --------------------------------------
// The pantry comparison is bidirectional substring matching:
//   normalizedIngredient.includes(productName) || productName.includes(normalizedIngredient)
// Short pantry names therefore match far too much, and the reverse direction
// lets a vague ingredient match a specific product.
describe("BUG: bidirectional substring matching over-matches pantry names", () => {
  it("lets the pantry item 'un' (flour) authorise anything containing 'un'", () => {
    // Owning flour should not authorise a loaf of bread or a bunch of grapes.
    const r = recipe("X", ["1 somun ekmek", "1 salkım üzüm kurusu"]);
    expect(filter([r], ["un"])).toHaveLength(1);
  });

  it("accepts a bare ingredient word that is merely a prefix of a pantry item", () => {
    // Reverse direction: "domates salçası".includes("salça") is false, but
    // "salça" is contained in the pantry name, so it passes.
    const r = recipe("X", ["salça"]);
    expect(filter([r], ["domates salçası"])).toHaveLength(1);
  });
});
