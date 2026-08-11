import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

import { useThemePreference } from "@/context/ThemeContext";

export function HeaderIconButton({
  icon,
  onPress,
  color,
  size = 16,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
  accessibilityLabel: string;
}) {
  const { resolvedScheme } = useThemePreference();
  // Varsayılan renk artık temaya göre dallanıyor — sabit #6E7A8D, koyu
  // moddaki bg-white/10 çip üzerinde ~3.3:1 kontrastla soluk/donuk
  // kalıyordu (bkz. AUDIT_FRONTEND.md DM-1). Çağıran taraf açıkça bir
  // `color` verirse (nadir) o hâlâ öncelikli.
  const resolvedColor = color ?? (resolvedScheme === "dark" ? "#cbd5e1" : "#6E7A8D");

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="ml-3 active:opacity-60">
      <View className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 items-center justify-center">
        <Ionicons name={icon} size={size} color={resolvedColor} />
      </View>
    </Pressable>
  );
}
