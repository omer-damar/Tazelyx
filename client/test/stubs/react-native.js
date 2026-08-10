// Minimal `react-native` stub for Node-based unit tests.
//
// The pure helpers we unit-test (`daysUntil` in ExpireBadge.tsx,
// `moodTierForScore` in LyxMascot.tsx) live in files that ALSO export a React
// Native component, so importing them pulls in `react-native`. The real
// package ships untranspiled Flow source and cannot be require()d from plain
// Node. These tests never render anything, so host components only need to
// exist as identifiers — they are never invoked.
const host = (name) => {
  const Component = () => null;
  Component.displayName = name;
  return Component;
};

module.exports = {
  View: host("View"),
  Text: host("Text"),
  Image: host("Image"),
  Pressable: host("Pressable"),
  TextInput: host("TextInput"),
  ScrollView: host("ScrollView"),
  ActivityIndicator: host("ActivityIndicator"),
  Modal: host("Modal"),
  FlatList: host("FlatList"),
  SectionList: host("SectionList"),
  KeyboardAvoidingView: host("KeyboardAvoidingView"),
  Alert: { alert: () => {} },
  Keyboard: { dismiss: () => {} },
  Linking: { openURL: () => Promise.resolve() },
  Platform: { OS: "ios", select: (spec) => spec.ios ?? spec.default },
  StyleSheet: {
    create: (styles) => styles,
    absoluteFill: {},
    absoluteFillObject: {},
  },
};
