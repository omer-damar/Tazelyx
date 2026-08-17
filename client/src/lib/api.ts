import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// JWT'ler 7 gün sonra süresi doluyor (bkz. receipt-ai/services/auth.js >
// JWT_EXPIRES_IN). SecureStore'da bir token bulunması tek başına "giriş
// yapılmış" anlamına gelmez — süresi dolmuş bir token'la her istek 401
// "Geçersiz veya süresi dolmuş token" döner. AuthContext, uygulama
// açılışında bu handler'ı kaydedip token'ı temizleyerek kullanıcıyı otomatik
// giriş ekranına düşürür.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Yanlış Wi-Fi ağındaki bir kullanıcı için (hardcoded LAN IP hiç yanıt
// vermez) fetch'in platform varsayılan zaman aşımı çok uzun (genelde 60 sn+)
// — bu süre boyunca ekranda "yükleniyor" dönüp durur, iptal etme veya "bağlantını
// kontrol et" gibi bir geri bildirim yok. 15 sn sonra isteği kendimiz iptal
// edip anlaşılır bir hata mesajı veriyoruz.
const REQUEST_TIMEOUT_MS = 15000;

// /recipes/suggest bir AI çağrısı (backend'de artık bir model kotası dolarsa
// sırayla bir sonrakine geçen bir zincir var, bkz. services/aiModelFallback.js
// — her deneme birkaç saniye sürebiliyor, zincirdeki birden fazla model
// denenirse üst üste eklenir) + ardından her tarif için ayrı bir gerçek-tarif
// arama isteği (services/recipeSearch.js) yapıyor — sıradan bir CRUD
// isteğinden çok daha uzun sürebiliyor. Genel 15 sn'lik zaman aşımı bu uçta
// gerçek kullanımda sürekli tetikleniyordu (bkz. kullanıcı raporu, "Bağlantı
// zaman aşımına uğradı" — bağlantı değil, istek gerçekten 15 sn'den uzun
// sürüyordu); model zinciri eklendikten sonra bile tek başına ~22 sn süren
// denemeler ölçüldü, bu yüzden pay 45 sn'den 60 sn'ye çıkarıldı.
const AI_REQUEST_TIMEOUT_MS = 60000;

async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}
): Promise<T> {
  const { method = "GET", body, token, timeoutMs = REQUEST_TIMEOUT_MS } = options;

  // AbortSignal.timeout() bir statik factory — Hermes'in bazı sürümlerinde
  // henüz yok, ve varsa/yoksa Jest (Node üzerinde çalışıyor, orada zaten var)
  // bu farkı hiç yakalayamaz. AbortController + setTimeout ikisinde de var
  // olan daha eski/temel API, bu yüzden ona geri dönüyoruz.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Bağlantı zaman aşımına uğradı. İnternet/Wi-Fi bağlantını kontrol et.", 0);
    }
    throw new ApiError("Sunucuya ulaşılamadı. İnternet/Wi-Fi bağlantını kontrol et.", 0);
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Yalnızca token gönderilmiş bir istek 401 aldığında tetiklenir — login/
    // register gibi token'sız (herkese açık) uç noktalarda yanlış şifre de
    // 401 dönebilir, bu durumla karıştırılmamalı (o ekranların kendi hata
    // gösterimi zaten var, oturum sonlandırma akışını tetiklememeli).
    if (response.status === 401 && token) {
      onUnauthorized?.();
    }
    throw new ApiError(data.message || "Bir şeyler ters gitti.", response.status);
  }

  return data as T;
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export function registerUser(email: string, password: string, name: string) {
  return apiRequest<{ message: string; user: AuthUser }>("/auth/register", {
    method: "POST",
    body: { email, password, name },
  });
}

export function loginUser(email: string, password: string) {
  return apiRequest<{ message: string; token: string; user: AuthUser }>(
    "/auth/login",
    { method: "POST", body: { email, password } }
  );
}

export function resendVerificationEmail(email: string) {
  return apiRequest<{ message: string }>("/auth/resend-verification", {
    method: "POST",
    body: { email },
  });
}

export function requestPasswordReset(email: string) {
  return apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export function resetPassword(token: string, newPassword: string) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: { token, newPassword },
  });
}

export function deleteAccount(token: string) {
  return apiRequest<{ message: string }>("/auth/account", {
    method: "DELETE",
    token,
  });
}

export type Product = {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  source: string;
  estimatedShelfLifeDays: number;
  estimatedExpireDate: string | null;
  manualExpireDate: string | null;
  effectiveExpireDate: string | null;
  expireDateSource: "estimated" | "manual";
  createdAt: string;
};

export function getProducts(token: string) {
  return apiRequest<{ message: string; count: number; products: Product[] }>(
    "/products",
    { token }
  );
}

export function getProduct(token: string, id: string) {
  return apiRequest<{ message: string; product: Product }>(`/products/${id}`, { token });
}

export function createProduct(
  token: string,
  input: { name: string; quantity: number; unit: string; manualExpireDate?: string }
) {
  return apiRequest<{ message: string; product: Product }>("/products", {
    method: "POST",
    token,
    body: input,
  });
}

export function updateProduct(
  token: string,
  id: string,
  input: Partial<{ name: string; quantity: number; unit: string; manualExpireDate: string | null }>
) {
  return apiRequest<{ message: string; product: Product }>(`/products/${id}`, {
    method: "PATCH",
    token,
    body: input,
  });
}

export function deleteProduct(token: string, id: string, reason?: "consumed" | "expired") {
  const query = reason ? `?reason=${reason}` : "";
  return apiRequest<{ message: string; product: Product }>(`/products/${id}${query}`, {
    method: "DELETE",
    token,
  });
}

export type DashboardSummary = {
  totalProducts: number;
  expiringSoon: number;
  manualExpire: number;
  estimatedExpire: number;
  runningLow: number;
};

export function getDashboardSummary(token: string) {
  return apiRequest<DashboardSummary>("/dashboard/summary", { token });
}

export function getExpiringSoonProducts(token: string, days?: number) {
  const query = days ? `?days=${days}` : "";
  return apiRequest<{ message: string; count: number; products: Product[] }>(
    `/products/expiring-soon${query}`,
    { token }
  );
}

export type Recipe = {
  title: string;
  description: string;
  category: string;
  servings: string;
  ingredients: string[];
  steps: string[];
  estimatedTime: string;
  tip: string;
  sourceLink: { title: string; url: string } | null;
};

export type PrioritizedProduct = {
  name: string;
  quantity: number;
  unit: string;
  effectiveExpireDate: string | null;
  expireDateSource: "estimated" | "manual";
};

export function getRecipeSuggestions(token: string) {
  return apiRequest<{
    message: string;
    prioritizedProducts: PrioritizedProduct[];
    recipes: { recipes: Recipe[] };
  }>("/recipes/suggest", { token, timeoutMs: AI_REQUEST_TIMEOUT_MS });
}

export type ParsedProduct = { name: string; quantity: number; unit: string };

export type UploadReceiptResult = {
  message: string;
  parsedProducts: ParsedProduct[];
};

// Fiş yükleme JSON değil multipart/form-data gönderiyor, bu yüzden
// apiRequest()'i kullanmıyor — Content-Type'ı fetch'in kendisi (boundary
// dahil) otomatik ayarlaması gerekiyor, elle "application/json" set etmek
// isteği bozar.
export async function uploadReceipt(
  token: string,
  file: { uri: string; name: string; mimeType: string }
) {
  const formData = new FormData();
  formData.append("receipt", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.message || "Fiş yüklenirken bir şeyler ters gitti.", response.status);
  }

  return data as UploadReceiptResult;
}

export type UploadedReceiptRecord = {
  _id: string;
  originalFilename: string;
  createdAt: string;
};

export function getUploadHistory(token: string) {
  return apiRequest<{ message: string; count: number; receipts: UploadedReceiptRecord[] }>(
    "/upload/history",
    { token }
  );
}

export type WasteScoreRange = "week" | "month" | "year" | "all";

export type WasteScoreEvent = {
  productName: string;
  reason: "consumed" | "expired";
  wasRescue: boolean;
  createdAt: string;
};

export type WasteScore = {
  range: WasteScoreRange;
  score: number | null;
  eventCount: number;
  consumedCount: number;
  expiredCount: number;
  rescueBonus: number;
  totalRescueCount: number;
  events: WasteScoreEvent[];
};

export function getWasteScore(token: string, range?: WasteScoreRange) {
  const query = range ? `?range=${range}` : "";
  return apiRequest<WasteScore>(`/waste-score${query}`, { token });
}

export function createProductsBulk(
  token: string,
  products: { name: string; quantity: number; unit: string; manualExpireDate?: string }[]
) {
  // Her ürün için (manuel tarih girilmemişse) sunucu tarafında ayrı bir AI
  // raf-ömrü tahmini yapılıyor (bkz. routes/products.js > mapWithConcurrency,
  // en fazla 5 eşzamanlı) — kalabalık bir fişte bu, tek bir CRUD isteğinden
  // çok daha uzun sürebiliyor.
  return apiRequest<{ message: string; count: number; products: Product[] }>(
    "/products/bulk",
    { method: "POST", token, body: { products }, timeoutMs: AI_REQUEST_TIMEOUT_MS }
  );
}

export type RunningLowProduct = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  dailyRate: number;
  predictedDaysRemaining: number;
};

export function getRunningLowProducts(token: string) {
  return apiRequest<{ message: string; count: number; products: RunningLowProduct[] }>(
    "/predictions/running-low",
    { token }
  );
}

export type ShoppingListItem = {
  _id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  isChecked: boolean;
  source: "manual" | "prediction";
  createdAt: string;
};

export function getShoppingList(token: string) {
  return apiRequest<{ message: string; count: number; items: ShoppingListItem[] }>(
    "/shopping-list",
    { token }
  );
}

export function addShoppingListItem(
  token: string,
  input: { name: string; quantity?: number; unit?: string; source?: "manual" | "prediction" }
) {
  return apiRequest<{ message: string; item: ShoppingListItem }>("/shopping-list", {
    method: "POST",
    token,
    body: input,
  });
}

export function updateShoppingListItem(
  token: string,
  id: string,
  input: Partial<{ name: string; quantity: number | null; unit: string | null; isChecked: boolean }>
) {
  return apiRequest<{ message: string; item: ShoppingListItem }>(`/shopping-list/${id}`, {
    method: "PATCH",
    token,
    body: input,
  });
}

export function deleteShoppingListItem(token: string, id: string) {
  return apiRequest<{ message: string; item: ShoppingListItem }>(`/shopping-list/${id}`, {
    method: "DELETE",
    token,
  });
}
