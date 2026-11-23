// API adresi kaynak koda yazılmaz; çalışma anında ortam değişkeninden veya
// Metro'nun adresinden türetilir. Bu testler üç yolu da sabitler.

type ExpoConfig = { hostUri?: string } | null;

function loadBaseUrl(expoConfig: ExpoConfig, envUrl?: string): string {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = envUrl;

  let result = "";
  jest.isolateModules(() => {
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { expoConfig },
    }));
    result = require("../config").API_BASE_URL;
  });

  if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = previous;
  return result;
}

describe("API_BASE_URL", () => {
  it("EXPO_PUBLIC_API_URL tanımlıysa onu kullanır", () => {
    expect(loadBaseUrl({ hostUri: "metro-host:8081" }, "https://api.example.test/api")).toBe(
      "https://api.example.test/api"
    );
  });

  it("tanımlı değilse Metro'nun adresini ve backend portunu kullanır", () => {
    expect(loadBaseUrl({ hostUri: "metro-host:8081" })).toBe("http://metro-host:4000/api");
  });

  it("Metro adresi yoksa localhost'a düşer", () => {
    expect(loadBaseUrl(null)).toBe("http://localhost:4000/api");
    expect(loadBaseUrl({})).toBe("http://localhost:4000/api");
  });
});
