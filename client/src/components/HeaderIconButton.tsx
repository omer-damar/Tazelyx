import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";

export function HeaderIconButton({
  icon,
  onPress,
  color = "#6E7A8D",
  size = 16,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} className="ml-3 active:opacity-60">
      <View className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/10 items-center justify-center">
        <Ionicons name={icon} size={size} color={color} />
      </View>
    </Pressable>
  );
}
