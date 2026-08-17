const OpenAI = require("openai");
const { createChatCompletionWithFallback } = require("../services/aiModelFallback");

function fakeClientThatFailsThenSucceeds(failuresByModel) {
  return {
    chat: {
      completions: {
        create: jest.fn(async ({ model }) => {
          const failure = failuresByModel[model];
          if (failure) throw failure;
          return { model, ok: true };
        }),
      },
    },
  };
}

// aiModelFallback.js, hangi modelin kota nedeniyle (429) yakın zamanda
// başarısız olduğunu SÜREÇ belleğinde (modül seviyesinde, testler arası
// paylaşılan) hatırlıyor — bu yüzden burada HER testte, başka bir testin
// bıraktığı bir cooldown'a yanlışlıkla takılmamak için benzersiz model
// adları kullanılıyor (aynı "a"/"b" adı iki testte kullanılırsa, birinci
// testte "a" 429 alırsa ikinci testte "a" sessizce atlanır).
describe("createChatCompletionWithFallback", () => {
  it("uses the first model when it succeeds, without touching the rest of the chain", async () => {
    const client = fakeClientThatFailsThenSucceeds({});
    const result = await createChatCompletionWithFallback(client, ["t1-a", "t1-b", "t1-c"], {});
    expect(result).toEqual({ model: "t1-a", ok: true });
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next model on a quota error (429)", async () => {
    const client = fakeClientThatFailsThenSucceeds({
      "t2-a": new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined),
    });
    const result = await createChatCompletionWithFallback(client, ["t2-a", "t2-b"], {});
    expect(result).toEqual({ model: "t2-b", ok: true });
  });

  it("falls back to the next model when the provider is overloaded (5xx)", async () => {
    const client = fakeClientThatFailsThenSucceeds({
      "t3-a": new OpenAI.InternalServerError(503, undefined, undefined, undefined),
    });
    const result = await createChatCompletionWithFallback(client, ["t3-a", "t3-b"], {});
    expect(result).toEqual({ model: "t3-b", ok: true });
  });

  it("falls back to the next model when a model name is unknown/unavailable (404)", async () => {
    const client = fakeClientThatFailsThenSucceeds({
      "t4-a": new OpenAI.NotFoundError(404, undefined, "model not found", undefined),
    });
    const result = await createChatCompletionWithFallback(client, ["t4-a", "t4-b"], {});
    expect(result).toEqual({ model: "t4-b", ok: true });
  });

  it("does NOT fall back on errors unrelated to model availability", async () => {
    const authError = new OpenAI.AuthenticationError(401, undefined, "bad key", undefined);
    const client = fakeClientThatFailsThenSucceeds({ "t5-a": authError });
    await expect(
      createChatCompletionWithFallback(client, ["t5-a", "t5-b"], {})
    ).rejects.toBe(authError);
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("throws the last error when every model in the chain is exhausted", async () => {
    const lastError = new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined);
    const client = fakeClientThatFailsThenSucceeds({
      "t6-a": new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined),
      "t6-b": lastError,
    });
    await expect(
      createChatCompletionWithFallback(client, ["t6-a", "t6-b"], {})
    ).rejects.toBe(lastError);
  });

  it("passes the rest of the request options through unchanged", async () => {
    const client = fakeClientThatFailsThenSucceeds({});
    await createChatCompletionWithFallback(client, ["t7-a"], {
      messages: [{ role: "user", content: "merhaba" }],
      temperature: 0.5,
    });
    expect(client.chat.completions.create).toHaveBeenCalledWith({
      model: "t7-a",
      messages: [{ role: "user", content: "merhaba" }],
      temperature: 0.5,
    });
  });

  describe("quota cooldown (429'dan sonra bir modeli bir süre atlama)", () => {
    it("REGRESSION: bir model kota nedeniyle (429) başarısız olduktan sonra, aynı süreçteki bir sonraki çağrı o modeli hiç DENEMEDEN atlar", async () => {
      // Gerçek kullanıcı raporu: kotası dolu bir model her istekte yine de
      // en baştan deneniyordu (5-10 sn boşa gidiyordu) — özellikle bir
      // sunum sırasında butona birkaç kez basıldığında bu tekrarlanıyordu.
      const client = fakeClientThatFailsThenSucceeds({
        "cooldown-1": new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined),
      });

      await createChatCompletionWithFallback(client, ["cooldown-1", "cooldown-2"], {});
      expect(client.chat.completions.create).toHaveBeenCalledTimes(2);

      client.chat.completions.create.mockClear();
      await createChatCompletionWithFallback(client, ["cooldown-1", "cooldown-2"], {});
      // "cooldown-1" hiç çağrılmadı (cooldown'da), sadece "cooldown-2" denendi.
      expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: "cooldown-2" })
      );
    });

    it("geçici aşırı yüklenme (503) bir modeli cooldown'a ALMAZ — bir sonraki çağrıda yine denenir", async () => {
      const client = fakeClientThatFailsThenSucceeds({
        "no-cooldown-1": new OpenAI.InternalServerError(503, undefined, undefined, undefined),
      });

      await createChatCompletionWithFallback(client, ["no-cooldown-1", "no-cooldown-2"], {});
      client.chat.completions.create.mockClear();

      await createChatCompletionWithFallback(client, ["no-cooldown-1", "no-cooldown-2"], {});
      // "no-cooldown-1" yine denendi (503 cooldown'a almaz), sadece o
      // yeniden başarısız olduğu için "no-cooldown-2"ye geçildi.
      expect(client.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(client.chat.completions.create.mock.calls[0][0]).toEqual(
        expect.objectContaining({ model: "no-cooldown-1" })
      );
    });

    it("cooldown süresi dolunca model tekrar denenir ve başarılı olursa kaydı temizlenir", async () => {
      jest.useFakeTimers();
      try {
        const client = fakeClientThatFailsThenSucceeds({
          "expires-1": new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined),
        });
        await createChatCompletionWithFallback(client, ["expires-1", "expires-2"], {});

        // Cooldown süresi (1 saat) + biraz fazlası kadar ileri sar.
        jest.advanceTimersByTime(61 * 60 * 1000);

        // Artık "expires-1" başarılı olsun.
        client.chat.completions.create = jest.fn(async ({ model }) => ({ model, ok: true }));
        const result = await createChatCompletionWithFallback(
          client,
          ["expires-1", "expires-2"],
          {}
        );
        expect(result).toEqual({ model: "expires-1", ok: true });
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
