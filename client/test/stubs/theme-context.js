// Gerçek ThemeContext.tsx, NativeWind'in useColorScheme()'ini içe aktarıyor
// — bu da düz Node ortamında (jest testleri) çalışmayan bir web/native
// runtime köprüsü gerektiriyor. Bu dosyaların (ExpireBadge.tsx,
// LyxMascot.tsx gibi) test edilen tek şeyi saf fonksiyonlar olduğu ve hiçbir
// test bileşeni render etmediği için, gerçek tema durumu yerine sabit bir
// "light" şema dönen minimal bir stub yeterli.
module.exports = {
  useThemePreference: () => ({
    preference: "system",
    resolvedScheme: "light",
    setPreference: () => {},
  }),
};
