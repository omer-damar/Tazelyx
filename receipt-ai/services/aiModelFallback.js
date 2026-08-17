const OpenAI = require("openai");

// Ücretsiz katmanda her modelin kendi (genelde düşük) günlük istek kotası
// var — "en yeni" model takma adı (ör. gemini-flash-latest) en düşük kotalı
// olma eğiliminde. Bir model kotası dolduğunda (429) ya da geçici olarak
// aşırı yüklendiğinde (503) TÜM özelliğin çökmesi yerine, config.js >
// AI_MODEL_CHAIN'de tanımlı sıradaki modele geçilir. Model adı geçersiz/
// artık sunulmuyorsa (404) o da atlanır — zincirdeki bir sonraki modele
// geçmek, isim yanlış yazılmış olsa bile isteği tamamen çökertmez.
//
// SADECE bu üç hata türünde bir sonrakine geçilir. Diğer hatalar (kimlik
// doğrulama, geçersiz istek gövdesi, ağ hatası vb.) farklı bir modelle de
// aynı şekilde başarısız olur — hemen fırlatılır, zincir boşuna tüketilmez.
function isRetryableWithAnotherModel(error) {
  return (
    error instanceof OpenAI.RateLimitError ||
    error instanceof OpenAI.InternalServerError ||
    error instanceof OpenAI.NotFoundError
  );
}

async function createChatCompletionWithFallback(client, modelChain, requestOptions) {
  let lastError;

  for (const model of modelChain) {
    try {
      return await client.chat.completions.create({ ...requestOptions, model });
    } catch (error) {
      if (!isRetryableWithAnotherModel(error)) throw error;

      lastError = error;
      console.warn(
        `AI modeli "${model}" kullanılamadı (${error.status}), sıradaki modele geçiliyor...`
      );
    }
  }

  // Zincirdeki HİÇBİR model işe yaramadı — çağıran taraf zaten (recipes.js'te
  // olduğu gibi) RateLimitError/InternalServerError'a göre anlamlı bir mesaj
  // gösteriyor, o yüzden son hatayı olduğu gibi yukarı fırlatmak yeterli.
  throw lastError;
}

module.exports = { createChatCompletionWithFallback };
