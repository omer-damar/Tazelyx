import "@/global.css";

import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppThemeProvider, useThemePreference } from "@/context/ThemeContext";
import { WasteScoreProvider } from "@/context/WasteScoreContext";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    // Kiler listesindeki kaydırarak silme (swipe-to-delete) jesti için
    // react-native-gesture-handler'ın gerektirdiği kök sarmalayıcı.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <AuthProvider>
          <WasteScoreProvider>
            <NavigationThemeBridge />
          </WasteScoreProvider>
        </AuthProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

// React Navigation'ın kendi header/durum-çubuğu teması (DarkTheme/DefaultTheme),
// kullanıcının Ayarlar'dan seçtiği tercihe göre değişen `resolvedScheme`'i
// takip ediyor — ham işletim sistemi ayarını değil (bkz. ThemeContext.tsx).
function NavigationThemeBridge() {
  const { resolvedScheme } = useThemePreference();

  return (
    <ThemeProvider value={resolvedScheme === "dark" ? DarkTheme : DefaultTheme}>
      <RootNavigator />
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { token, isLoading } = useAuth();

  // Render gövdesinde (her render'da) değil, bir efekt içinde (sadece
  // isLoading gerçekten değiştiğinde) çalışmalı — React Compiler bunu
  // yan etki olarak işaretliyor. hideAsync() zaten idempotent olduğu için
  // önceki hâli pratikte bozuk değildi, ama bu doğru desen.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!token}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={!token}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
