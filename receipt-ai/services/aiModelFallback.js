const OpenAI = require("openai");

// Ücretsiz katmanda her modelin kendi (genelde düşük) günlük istek kotası
// var — "en yeni" model takma adı (ör. gemini-flash-latest) en düşük kotalı
// olma eğiliminde. Bir model kotası dolduğunda (429) ya da geçici olarak
// aşırı yüklendiğinde (503) TÜM özelliğin çökmesi yerine, config.js >
// AI_MODEL_CHAIN'de tanımlı sıradaki modele geçilir. Model adı geçersiz/
// artık sunulmuyorsa (404) o da atlanır. Bir modelin isteği kendi zaman
// aşımı süresine kadar hiç yanıt vermemesi de (APIConnectionTimeoutError/
// APIConnectionError) aynı şekilde ele alınır — bir modelin yavaş/erişilemez
// olması diğerlerinin de öyle olacağı anlamına gelmez, zincirin orada
// tamamen ölmesindense bir sonraki model denenir.
//
// SADECE bu hata türlerinde bir sonrakine geçilir. Diğer hatalar (kimlik
// doğrulama, geçersiz istek gövdesi vb.) farklı bir modelle de aynı şekilde
// başarısız olur — hemen fırlatılır, zincir boşuna tüketilmez.
function isRetryableWithAnotherModel(error) {
  return (
    error instanceof OpenAI.RateLimitError ||
    error instanceof OpenAI.InternalServerError ||
    error instanceof OpenAI.NotFoundError ||
    error instanceof OpenAI.APIConnectionTimeoutError ||
    error instanceof OpenAI.APIConnectionError
  );
}

// Süreç belleğinde (process.memory) tutulan basit bir "kota tükendi" hafızası
// — sunucu her yeniden başladığında sıfırlanır, kalıcı bir depoya (DB/Redis)
// gerek yok, amacı sadece AYNI sunucu çalışırken art arda gelen isteklerin
// zaten o gün kotası dolduğu bilinen bir modeli tekrar tekrar boşuna
// denememesi. 429 (RateLimitError = kota/hız sınırı) SADECE bu türde
// kaydediliyor — 503 (geçici aşırı yüklenme) birkaç saniye içinde
// kendiliğinden düzelebileceği için cooldown'a alınmıyor, her istekte
// yeniden denenmeye değer.
//
// Gerçek bir kullanıcı raporuyla bulundu: kotası dolu bir model her istekte
// yine de en baştan deneniyordu (5-10 sn boşa gidiyordu) — özellikle bir
// sunum/demo sırasında butona birkaç kez basıldığında bu, her seferinde
// tekrarlanan gereksiz bir gecikmeydi.
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // 1 saat
const quotaCooldownUntil = new Map();

async function createChatCompletionWithFallback(client, modelChain, requestOptions) {
  let lastError;
  const now = Date.now();

  for (const model of modelChain) {
    const cooldownExpiresAt = quotaCooldownUntil.get(model);
    if (cooldownExpiresAt && cooldownExpiresAt > now) {
      const minutesLeft = Math.ceil((cooldownExpiresAt - now) / 60000);
      console.warn(
        `AI modeli "${model}" kota nedeniyle atlanıyor (yaklaşık ${minutesLeft} dk sonra tekrar denenecek)`
      );
      continue;
    }

    try {
      const result = await client.chat.completions.create({ ...requestOptions, model });
      quotaCooldownUntil.delete(model);
      return result;
    } catch (error) {
      if (!isRetryableWithAnotherModel(error)) throw error;

      lastError = error;
      if (error instanceof OpenAI.RateLimitError) {
        quotaCooldownUntil.set(model, now + QUOTA_COOLDOWN_MS);
      }
      console.warn(
        `AI modeli "${model}" kullanılamadı (${error.status}), sıradaki modele geçiliyor...`
      );
    }
  }

  // Zincirdeki HİÇBİR model işe yaramadı (denenenler dahil, cooldown'da
  // atlananlar dahil) — çağıran taraf zaten (recipes.js'te olduğu gibi)
  // RateLimitError/InternalServerError'a göre anlamlı bir mesaj gösteriyor,
  // o yüzden son GERÇEKTEN denenen hatayı olduğu gibi yukarı fırlatmak
  // yeterli. Eğer TÜM modeller cooldown'daysa (lastError hiç set edilmediyse)
  // zincirdeki ilk modelin cooldown'unu yine de bir kez zorla dener —
  // sessizce "hiçbir şey denemeden" başarısız olmamak için.
  if (!lastError) {
    return client.chat.completions.create({ ...requestOptions, model: modelChain[0] });
  }

  throw lastError;
}

module.exports = { createChatCompletionWithFallback };
