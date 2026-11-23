import { ApiError, setUnauthorizedHandler, uploadReceipt } from "../api";

// uploadReceipt daha önce ham fetch çağırıyordu: istemci zaman aşımı yoktu ve
// 401 gelince oturum kapatma işleyicisi çalışmıyordu. Artık ortak apiRequest
// yolundan geçiyor; bu testler o iki davranışı ve multipart gönderiminin
// bozulmadığını (JSON Content-Type eklenmediğini) sabitler.

const file = { uri: "file:///fis.jpg", name: "fis.jpg", mimeType: "image/jpeg" };

// expo-file-system yerel modül ister; testte baytları sabit dönen bir sahte File yeterli.
jest.mock("expo-file-system", () => ({
  File: class {
    constructor(public uri: string) {}
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
  },
}));

// Node'un FormData'sı Blob olmayan nesneyi stringe çevirir; eklenen parçayı
// inceleyebilmek için eklenenleri olduğu gibi tutan sade bir FormData kullanıyoruz.
class FakeFormData {
  parts: [string, unknown][] = [];
  append(key: string, value: unknown) {
    this.parts.push([key, value]);
  }
}
const realFormData = globalThis.FormData;

type FetchInit = RequestInit & { headers: Record<string, string> };
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
  (globalThis as unknown as { FormData: unknown }).FormData = FakeFormData;
  setUnauthorizedHandler(null);
});

afterEach(() => {
  jest.useRealTimers();
  (globalThis as unknown as { FormData: unknown }).FormData = realFormData;
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("uploadReceipt", () => {
  it("sends the receipt as multipart without forcing a JSON Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { message: "ok", parsedProducts: [] }));

    const result = await uploadReceipt("tok", file);

    expect(result).toEqual({ message: "ok", parsedProducts: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, FetchInit];
    expect(url).toMatch(/\/upload$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FakeFormData);
    expect(init.headers.Authorization).toBe("Bearer tok");

    // SDK 58 regresyonu: expo/fetch eski { uri, name, type } nesnesini reddediyor
    // ("Unsupported FormDataPart implementation"). Parça bayt okuyabilmeli ve
    // sunucunun tür denetimi için ad/MIME türünü taşımalı.
    const [fieldName, part] = (init.body as unknown as FakeFormData).parts[0] as [
      string,
      { name: string; type: string; bytes: () => Promise<Uint8Array>; uri?: string },
    ];
    expect(fieldName).toBe("receipt");
    expect(part.name).toBe("fis.jpg");
    expect(part.type).toBe("image/jpeg");
    expect(part.uri).toBeUndefined();
    expect(Array.from(await part.bytes())).toEqual([1, 2, 3]);
    // Content-Type'ı fetch kendisi (boundary ile) üretmeli.
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("signs the user out when the server answers 401", async () => {
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "Bu belirtece ait hesap bulunamadı." }));

    await expect(uploadReceipt("tok", file)).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Bu belirtece ait hesap bulunamadı.",
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("keeps the server's own error status and message (e.g. 409 duplicate receipt)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { message: "Bu fiş daha önce yüklenmiş." }));

    await expect(uploadReceipt("tok", file)).rejects.toMatchObject({
      status: 409,
      message: "Bu fiş daha önce yüklenmiş.",
    });
  });

  it("turns a network failure into a friendly ApiError instead of a raw TypeError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    const error = await uploadReceipt("tok", file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });

  it("aborts after 90 seconds (and not earlier) with a timeout ApiError", async () => {
    jest.useFakeTimers();
    // fetch, signal iptal edilince AbortError ile reddeden gerçek davranışı taklit eder.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const abortError = new Error("aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })
    );

    let settled = false;
    const pending = uploadReceipt("tok", file).catch((e: unknown) => {
      settled = true;
      return e;
    });

    await jest.advanceTimersByTimeAsync(89_000);
    expect(settled).toBe(false); // 15 sn'lik genel sınır bu uçta uygulanmamalı

    await jest.advanceTimersByTimeAsync(1_500);
    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toMatch(/zaman aşımı/i);
  });
});
