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

describe("createChatCompletionWithFallback", () => {
  it("uses the first model when it succeeds, without touching the rest of the chain", async () => {
    const client = fakeClientThatFailsThenSucceeds({});
    const result = await createChatCompletionWithFallback(client, ["a", "b", "c"], {});
    expect(result).toEqual({ model: "a", ok: true });
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("falls back to the next model on a quota error (429)", async () => {
    const client = fakeClientThatFailsThenSucceeds({
      a: new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined),
    });
    const result = await createChatCompletionWithFallback(client, ["a", "b"], {});
    expect(result).toEqual({ model: "b", ok: true });
  });

  it("falls back to the next model when the provider is overloaded (5xx)", async () => {
    const client = fakeClientThatFailsThenSucceeds({
      a: new OpenAI.InternalServerError(503, undefined, undefined, undefined),
    });
    const result = await createChatCompletionWithFallback(client, ["a", "b"], {});
    expect(result).toEqual({ model: "b", ok: true });
  });

  it("falls back to the next model when a model name is unknown/unavailable (404)", async () => {
    const client = fakeClientThatFailsThenSucceeds({
      a: new OpenAI.NotFoundError(404, undefined, "model not found", undefined),
    });
    const result = await createChatCompletionWithFallback(client, ["a", "b"], {});
    expect(result).toEqual({ model: "b", ok: true });
  });

  it("does NOT fall back on errors unrelated to model availability", async () => {
    const authError = new OpenAI.AuthenticationError(401, undefined, "bad key", undefined);
    const client = fakeClientThatFailsThenSucceeds({ a: authError });
    await expect(createChatCompletionWithFallback(client, ["a", "b"], {})).rejects.toBe(authError);
    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("throws the last error when every model in the chain is exhausted", async () => {
    const lastError = new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined);
    const client = fakeClientThatFailsThenSucceeds({
      a: new OpenAI.RateLimitError(429, undefined, "quota exceeded", undefined),
      b: lastError,
    });
    await expect(createChatCompletionWithFallback(client, ["a", "b"], {})).rejects.toBe(lastError);
  });

  it("passes the rest of the request options through unchanged", async () => {
    const client = fakeClientThatFailsThenSucceeds({});
    await createChatCompletionWithFallback(client, ["a"], {
      messages: [{ role: "user", content: "merhaba" }],
      temperature: 0.5,
    });
    expect(client.chat.completions.create).toHaveBeenCalledWith({
      model: "a",
      messages: [{ role: "user", content: "merhaba" }],
      temperature: 0.5,
    });
  });
});
