import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemePreference } from "@/context/ThemeContext";

// Native Stack header'ının headerRight/headerLeft slot'ları içeriği kendi
// otomatik pill/kapsül arka planına sarar ve boyut/hizalama üzerinde kontrol
// vermez. Alt tab bar'daki aynı sorun CustomTabBar ile tamamen elle çizilerek
// çözülmüştü; burada da aynı yaklaşım izlenir — header tamamen burada
// çizilir, native chrome devreye girmez.
export function AppHeader({
  title,
  left,
  right,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const { resolvedScheme } = useThemePreference();
  const isDark = resolvedScheme === "dark";

  return (
    <SafeAreaView
      edges={["top"]}
      className={isDark ? "bg-[#0B1220]" : "bg-white"}
      style={{
        borderBottomWidth: 1,
        borderBottomColor: isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9",
      }}>
      <View style={{ minHeight: 100, justifyContent: "center" }}>
        <View style={{ position: "absolute", left: 103, right: 100, alignItems: "center" }}>
          <Text
            numberOfLines={1}
            className="text-ink dark:text-white font-bold text-lg">
            {title}
          </Text>
        </View>
        <View className="flex-row items-center justify-between px-3">
          <View style={{ minHeight: 87, justifyContent: "center" }}>{left}</View>
          <View className="flex-row items-center">{right}</View>
        </View>
      </View>
    </SafeAreaView>
  );
}
