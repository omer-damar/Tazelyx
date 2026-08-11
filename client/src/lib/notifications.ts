import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { Product, RunningLowProduct } from "./api";

// Bildirimler tamamen cihaz üzerinde zamanlanır (yerel/local notification) —
// uzak bir sunucudan push gelmez, tamamen ürünün effectiveExpireDate'ine göre
// burada hesaplanır. Bu yüzden Expo Go'da (geliştirme sürümünde) de çalışır;
// Expo Go SDK 53'ten beri uzak push bildirimlerini desteklemiyor ama yerel
// zamanlanmış bildirimler bundan etkilenmez.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permissionEnsured = false;

async function ensurePermission() {
  if (permissionEnsured) return;
  permissionEnsured = true;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    await Notifications.requestPermissionsAsync();
  }
}

// Türkçe'de ilk harfi büyütürken toLocaleUpperCase("tr") kullanmak şart —
// düz toUpperCase() Türkçe "i"yi "I" (noktasız) yerine yanlış "I" yapıyor
// (bkz. receipt-ai/services/shelfLife.js'teki aynı sorun, backend'de de
// aynı tr-locale çözümü uygulanmıştı).
function capitalize(name: string) {
  if (!name) return name;
  return name.charAt(0).toLocaleUpperCase("tr") + name.slice(1);
}

// İki ayrı bildirim türü var (SKT + tükenmek üzere); ikisi de aynı "her
// yüklemede tamamen iptal edip yeniden kur" mantığını kullanır. Ancak
// cancelAllScheduledNotificationsAsync() kullanılmaz, çünkü bu ikisi
// birbirini iptal eder (Kiler'de SKT senkronu, Tükenmek Üzere'de az önce
// kurulmuş bildirimleri de silerdi). Her bildirim content.data.type ile
// etiketlenir; sync fonksiyonları yalnızca kendi türünü iptal eder.
//
// Bu, o türe ait ESKİ bildirimlerin kimliklerini (identifier) DÖNDÜRÜR,
// iptal etmez — çağıran taraf önce yeni bildirimleri kurup ANCAK ONDAN
// SONRA bu kimlikleri iptal etmeli. Aksi halde (ör. "kur, sonra type'a
// göre sorgula ve iptal et") az önce kurulan YENİ bildirimler de aynı
// type etiketini taşıdığı için sorguya yakalanıp anında iptal edilir —
// bu tam olarak yaşanan bug'dı: her senkron, kendi kurduğunu kendi siliyordu.
async function getScheduledIdsByType(type: "expiry" | "running-low"): Promise<string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .filter((notification) => notification.content.data?.type === type)
    .map((notification) => notification.identifier);
}

async function cancelByIds(identifiers: string[]) {
  await Promise.all(
    identifiers.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier))
  );
}

const REMINDER_STEPS: { daysBefore: number; body: (name: string) => string }[] = [
  { daysBefore: 3, body: (name) => `${capitalize(name)} ürününüz 3 gün içinde bozulacak!` },
  { daysBefore: 2, body: (name) => `${capitalize(name)} ürününüz 2 gün içinde bozulacak!` },
  { daysBefore: 1, body: (name) => `${capitalize(name)} ürününüz 1 gün içinde bozulacak!` },
  {
    daysBefore: 0,
    body: (name) => `${capitalize(name)} ürününüzün son kullanma tarihi bugün doluyor!`,
  },
];

// Kilerdeki ürünlerin son kullanma tarihine göre bildirimleri yeniden kurar.
// Basit ve sağlam yaklaşım: önce tüm zamanlanmış bildirimler iptal edilip
// güncel ürün listesine göre sıfırdan kurulur — ürün ekle/sil/düzenle
// noktalarında ayrı ayrı iptal/yeniden-kurma mantığı yazmaktansa (birden
// fazla ekrandan ürün mutasyonu yapılabiliyor: add/edit/upload/silme) her
// Kiler yüklemesinde tam senkronizasyon yapmak daha az hataya açıktır.
// İptal işlemi yalnızca "expiry" türünü hedeflediği için diğer bildirim
// türlerini silme riski yoktur.
// iOS, bekleyen yerel bildirim sayısını 64 ile sınırlıyor — bu sınırın
// üzerine çıkıldığında fazlalık bildirimler hiçbir hata vermeden sessizce
// kurulmuyor. Ürün başına 4 bildirim (T-3/T-2/T-1/T-0) kurulduğu için ~16
// ürün civarında bu sınıra ulaşılabiliyor, ki bu normal bir kiler boyutu.
// Bu yüzden en yakında bozulacak ürünlere öncelik veriyoruz: sınıra
// ulaşınca kurmayı durduruyoruz, zaten daha uzak tarihli ürünlerin
// hatırlatması daha az acildir.
const MAX_EXPIRY_NOTIFICATIONS = 48;

function hasEffectiveExpireDate(
  product: Product
): product is Product & { effectiveExpireDate: string } {
  return product.quantity > 0 && !!product.effectiveExpireDate;
}

export async function syncExpiryNotifications(products: Product[]) {
  await ensurePermission();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const previousIds = await getScheduledIdsByType("expiry");

  const now = Date.now();

  const prioritizedProducts = products
    .filter(hasEffectiveExpireDate)
    .sort(
      (a, b) =>
        new Date(a.effectiveExpireDate).getTime() - new Date(b.effectiveExpireDate).getTime()
    );

  let scheduledCount = 0;

  for (const product of prioritizedProducts) {
    if (scheduledCount >= MAX_EXPIRY_NOTIFICATIONS) break;

    const expireDate = new Date(product.effectiveExpireDate);

    for (const step of REMINDER_STEPS) {
      if (scheduledCount >= MAX_EXPIRY_NOTIFICATIONS) break;

      const triggerDate = new Date(expireDate);
      triggerDate.setDate(triggerDate.getDate() - step.daysBefore);
      triggerDate.setHours(9, 0, 0, 0);

      if (triggerDate.getTime() <= now) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Tazelyx",
          body: step.body(product.name),
          data: { type: "expiry" },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
      scheduledCount += 1;
    }
  }

  // Eski bildirimler (yukarıda YENİLERİ kurulmadan ÖNCE yakalanan kimlikler)
  // ancak şimdi, kurma adımı başarıyla bittikten SONRA iptal edilir — hem
  // "kurma yarıda hata verirse eski bildirim kaybolmasın" hem de "az önce
  // kurduğumuz yeni bildirimleri kendi kendimize silmeyelim" için şart.
  await cancelByIds(previousIds);
}

// Backend'in `predictRunningLow`'u (bkz. receipt-ai/services/
// consumptionPrediction.js) yalnızca zaten kritik eşiğin (RUNNING_LOW_DAYS=1
// gün) içindeki ürünleri döndürür — yani bu fonksiyona gelen her ürün zaten
// "bugün-yarın tükenecek" demektir. Bu yüzden SKT bildirimindeki gibi
// "tahmini tükenme tarihinden 1 gün önce" hesaplamak burada işe yaramaz: o
// zaman noktası her zaman geçmişte kalır ve bildirim hiç kurulmaz. Bunun
// yerine en yakın makul zaman dilimine (bugün 18:00 geçmemişse bugün 18:00,
// geçtiyse yarın 09:00) bildirim kuruluyor.
export async function syncRunningLowNotifications(products: RunningLowProduct[]) {
  await ensurePermission();

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const previousIds = await getScheduledIdsByType("running-low");

  if (products.length === 0) {
    await cancelByIds(previousIds);
    return;
  }

  const now = new Date();
  const todayEvening = new Date(now);
  todayEvening.setHours(18, 0, 0, 0);

  const triggerDate =
    todayEvening.getTime() > now.getTime()
      ? todayEvening
      : (() => {
          const tomorrowMorning = new Date(now);
          tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
          tomorrowMorning.setHours(9, 0, 0, 0);
          return tomorrowMorning;
        })();

  // Önce YENİ bildirimleri kuruyoruz, eskilerini (yukarıda kurmadan ÖNCE
  // yakalanan kimlikleri) ancak bu başarıyla bittikten SONRA iptal
  // ediyoruz — hem yarıda hata olursa eski bildirim kaybolmasın hem de az
  // önce kurduğumuz yenileri kendi kendimize silmeyelim diye.
  await Promise.all(
    products.map((product) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: "Tazelyx",
          // "Yakında" yerine "bugün ya da yarın" — RUNNING_LOW_DAYS eşiği 1
          // gün olduğu için bu listeye düşen her ürün için bu ifade her
          // zaman doğru; SKT bildirimlerindeki gibi kesin bir gün sayısı
          // vermiyoruz çünkü predictedDaysRemaining kesin bir tarih değil,
          // geçmiş tüketim hızından türetilmiş bir tahmin.
          body: `${capitalize(product.name)} ürününüz bugün ya da yarın tükenebilir — almayı unutmayın!`,
          data: { type: "running-low" },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      })
    )
  );

  await cancelByIds(previousIds);
}
