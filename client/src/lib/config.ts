import Constants from "expo-constants";

// Backend'in dinlediği port (receipt-ai/server.js).
const API_PORT = 4000;

// Telefon (Expo Go) ile bilgisayar aynı ağda olmalıdır; "localhost" telefondan
// bilgisayara değil telefonun kendisine işaret eder. Bu yüzden adres kaynak
// koda yazılmaz, çalışma anında belirlenir:
//   1. EXPO_PUBLIC_API_URL tanımlıysa (client/.env.local) o kullanılır,
//      örn. EXPO_PUBLIC_API_URL=http://<bilgisayarın-yerel-IP'si>:4000/api
//      (tünel kullanırken veya Metro'dan farklı bir makinedeki backend için).
//   2. Aksi hâlde Metro'nun telefona verdiği adres (Expo Go'nun QR ile bağlandığı
//      bilgisayar) kullanılır; backend aynı bilgisayarda çalıştığı için ağ
//      değişse bile elle bir şey güncellemek gerekmez.
//   3. Hiçbiri yoksa localhost (yalnızca emülatör/web için anlamlıdır).
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;

  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${metroHost || "localhost"}:${API_PORT}/api`;
}

export const API_BASE_URL = resolveApiBaseUrl();
