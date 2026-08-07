const config = require("../config");

// AI'nin ürettiği tarif, gerçek bir siteden alınmıyor (Gemini kendi
// bilgisinden üretiyor) — bu yüzden ona sahte bir "kaynak" iddia etmek
// yanıltıcı olurdu. Bunun yerine Tavily (AI uygulamaları için bir arama
// API'si) ile nefisyemektarifleri.com'da GERÇEKTEN var olan, ilgili bir
// tarifi arayıp, bulursa dürüstçe "ilgili gerçek tarif" olarak sunuyoruz —
// AI'nin ürettiği tarifin "kaynağı" olduğunu iddia etmeden.
async function findRelatedRealRecipe(query) {
  if (!config.TAVILY_API_KEY) return null;

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.TAVILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        include_domains: ["nefisyemektarifleri.com"],
        max_results: 1,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const [firstResult] = data.results || [];
    if (!firstResult) return null;

    return { title: firstResult.title, url: firstResult.url };
  } catch (error) {
    // Arama başarısız olursa tarif önerisinin tamamını bozmuyoruz —
    // sadece o tarif için kaynak linki olmadan devam ediyoruz.
    console.warn("Tavily tarif araması başarısız:", error.message);
    return null;
  }
}

module.exports = { findRelatedRealRecipe };
