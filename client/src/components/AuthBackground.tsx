import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { type PropsWithChildren } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Tüm auth ekranlarında (giriş/kayıt/onay/şifre sıfırlama) ortak kullanılan
// "taze" temalı arka plan: yeşil-teal dalga+yaprak görseli üzerinde yarı
// saydam, bulanıklaştırılmış (glass) bir kart içinde form. Ekranın herhangi
// bir boş noktasına dokununca klavyeyi kapatır.
//
// KeyboardAvoidingView, `justify-content: center` ile ortalayan bir ata
// (SafeAreaView) içinde auto-height olarak kurulursa sonsuz bir salınıma yol
// açar: klavye açıldığında paddingBottom eklenip büyür, bu da onu ortalayan
// atası tarafından yukarı kaydırılmasına neden olur, bu kayma
// KeyboardAvoidingView'ın kendi konum ölçümünü değiştirir, o da paddingi
// yeniden hesaplar ve döngü sürer. Çözüm: KeyboardAvoidingView kendisi
// `flex-1 justify-center` olup ortalamayı kendisi yapar, dış çerçevesi sabit
// kalır ve atası onu kaydırmaz. Bu yüzden KeyboardAvoidingView her ekranda
// değil, tek yerde (burada) kurulur — ekranlar yalnızca düz içerik döndürür.
export function AuthBackground({ children }: PropsWithChildren) {
  return (
    <View className="flex-1">
      <Image
        source={require("@/assets/images/auth-background.png")}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      <Pressable
        className="flex-1"
        onPress={Keyboard.dismiss}
        // Basıldığında klavyeyi kapatmak dışında bir görsel etki istemiyoruz.
        android_disableSound
        accessible={false}>
        <SafeAreaView className="flex-1 px-6">
          <KeyboardAvoidingView
            className="flex-1 justify-center"
            behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <BlurView
              intensity={35}
              tint="light"
              className="overflow-hidden rounded-[28px] px-6 py-8"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
              {children}
            </BlurView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Pressable>
    </View>
  );
}
