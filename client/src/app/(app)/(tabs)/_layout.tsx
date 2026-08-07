import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemePreference } from "@/context/ThemeContext";

type IconName = keyof typeof Ionicons.glyphMap;

// route adı -> ikon/etiket eşlemesi. Tam özel tab bar'da React Navigation'ın
// kendi tabBarIcon/tabBarLabel mekanizması hiç kullanılmıyor (aşağıdaki
// CustomTabBar her şeyi kendi çiziyor), bu yüzden eşleme burada, elle.
const TAB_CONFIG: Record<string, { name: IconName; focusedName: IconName; label: string }> = {
  index: { name: "file-tray-stacked-outline", focusedName: "file-tray-stacked", label: "Kiler" },
  upload: { name: "scan-outline", focusedName: "scan", label: "Tara" },
  recipes: { name: "nutrition-outline", focusedName: "nutrition", label: "Tarifler" },
  dashboard: { name: "stats-chart-outline", focusedName: "stats-chart", label: "Panel" },
};

// React Navigation'ın varsayılan tab bar'ı tabBarIcon/tabBarStyle ile
// özelleştirildiğinde kendi iç ikon/etiket yuvası boyutlandırmasıyla çakışıp
// metni kesiyor. Bunun yerine tab bar tamamen burada, elle çiziliyor —
// gizli bir iç kısıtlamaya bağımlı değil, düzen tamamen bu bileşenin
// kontrolünde.
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: insets.bottom > 0 ? insets.bottom : 16,
        height: 68,
        borderRadius: 28,
        overflow: "hidden",
        flexDirection: "row",
      }}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(12,22,36,0.92)" }]} />
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 24,
          right: 24,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.1)",
        }}
      />

      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const config = TAB_CONFIG[route.name];
        if (!config) return null;

        function onPress() {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                minWidth: 56,
                paddingHorizontal: 8,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: focused ? "rgba(25,199,163,0.14)" : "transparent",
                borderWidth: focused ? 1 : 0,
                borderColor: "rgba(95,255,210,0.22)",
              }}>
              <Ionicons
                name={focused ? config.focusedName : config.name}
                size={19}
                color={focused ? "#19C7A3" : "#8b98a8"}
              />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 10,
                  lineHeight: 13,
                  marginTop: 4,
                  color: focused ? "#ffffff" : "#8b98a8",
                  fontWeight: focused ? "600" : "400",
                }}>
                {config.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { resolvedScheme } = useThemePreference();
  const backgroundColor = resolvedScheme === "dark" ? "#0B1220" : "#F4F7F8";

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor },
      }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="upload" />
      <Tabs.Screen name="recipes" />
      <Tabs.Screen name="dashboard" />
    </Tabs>
  );
}
