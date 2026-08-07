import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";

const THEME_PREFERENCE_KEY = "tazelyx_theme_preference";

export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  // Tercih "system" olduğunda cihaz ayarına göre değişen etkin şema. Inline
  // renk kullanan yerlerde (ör. Ionicons color prop'u) "dark:" className
  // varyantı işlemediği için bu değer kullanılmalı.
  resolvedScheme: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemePreference() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useThemePreference, bir <AppThemeProvider> içinde kullanılmalı.");
  }
  return value;
}

// NativeWind'in useColorScheme() hook'u "dark:" className varyantlarının hangi
// şemayı kullanacağını global olarak belirler. React Native'in kendi
// useColorScheme()'i yalnızca işletim sistemi ayarını okur ve uygulama içi
// tercihi (Sistem/Açık/Koyu) geçersiz kılamaz; bu yüzden tüm uygulama
// NativeWind'in hook'u üzerinden yönetilir.
export function AppThemeProvider({ children }: PropsWithChildren) {
  const { colorScheme, setColorScheme } = useNativeWindColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    (async () => {
      const stored = (await SecureStore.getItemAsync(THEME_PREFERENCE_KEY)) as ThemePreference | null;
      const initial = stored ?? "system";
      setPreferenceState(initial);
      setColorScheme(initial);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setPreference(next: ThemePreference) {
    setPreferenceState(next);
    setColorScheme(next);
    await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, next);
  }

  return (
    <ThemeContext.Provider
      value={{
        preference,
        resolvedScheme: colorScheme ?? "light",
        setPreference,
      }}>
      {children}
    </ThemeContext.Provider>
  );
}
