import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";

import type { AuthUser } from "@/lib/api";
import { setUnauthorizedHandler } from "@/lib/api";

const TOKEN_KEY = "tazelyx_auth_token";
const USER_KEY = "tazelyx_auth_user";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  // Token süresi dolduğu için oturum otomatik kapatıldığında dolu — login
  // ekranı bunu okuyup kullanıcıya NEDEN giriş ekranına düştüğünü
  // açıklayabiliyor (bkz. lib/api.ts > setUnauthorizedHandler).
  sessionExpiredMessage: string | null;
  clearSessionExpiredMessage: () => void;
  signIn: (token: string, user: AuthUser) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth, bir <AuthProvider> içinde kullanılmalı.");
  }
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  // Uygulama açılışında daha önce girilmiş bir oturum var mı diye
  // cihazın güvenli deposuna (SecureStore) bakıyoruz.
  useEffect(() => {
    (async () => {
      const [storedToken, storedUser] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      setToken(storedToken);
      setUser(storedUser ? JSON.parse(storedUser) : null);
      setIsLoading(false);
    })();
  }, []);

  async function signIn(newToken: string, newUser: AuthUser) {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, newToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(newUser)),
    ]);
    setToken(newToken);
    setUser(newUser);
  }

  async function signOut() {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    setToken(null);
    setUser(null);
  }

  // signOut/setSessionExpiredMessage hiçbir değişen state'i okumuyor (sadece
  // setter'lar + sabit SecureStore çağrıları), bu yüzden bir kere kaydetmek
  // güvenli — her render'da yeniden kaydetmeye gerek yok.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionExpiredMessage("Oturumun süresi doldu, tekrar giriş yapmalısın.");
      signOut();
    });
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearSessionExpiredMessage() {
    setSessionExpiredMessage(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoading,
        sessionExpiredMessage,
        clearSessionExpiredMessage,
        signIn,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}
