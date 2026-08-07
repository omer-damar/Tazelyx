# 🥬 Tazelyx — Akıllı Kiler

**Tazelyx**, kilerinizdeki ürünleri takip eden, son kullanma tarihlerini yöneten, fiş
fotoğrafından ürünleri otomatik tanıyan ve israfı azaltmaya yönelik davranışsal geri
bildirim sunan bir akıllı kiler yönetim uygulamasıdır. React Native (Expo) tabanlı bir
mobil istemci ve Node.js/Express tabanlı bir REST API'den oluşur.

Bu proje bir bitirme tezi kapsamında geliştirilmiştir.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Mimari ve Teknik Kararlar](#mimari-ve-teknik-kararlar)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Proje Yapısı](#proje-yapısı)
- [Kurulum](#kurulum)
- [Ortam Değişkenleri](#ortam-değişkenleri)
- [API Genel Bakış](#api-genel-bakış)

---

## Özellikler

### 🔐 Kimlik Doğrulama
- E-posta/şifre ile kayıt, e-posta onayı (markalı HTML onay sayfası)
- Giriş — kayıtsız e-posta ve yanlış şifre için ayrı, net hata mesajları
- Şifremi unuttum / şifre sıfırlama (güvenli, süreli token tabanlı akış)
- JWT tabanlı oturum (7 gün geçerli); süresi dolduğunda kullanıcı otomatik olarak
  giriş ekranına yönlendirilir ve nedeni açıkça belirtilir
- Hesap silme — kullanıcıya ait tüm veriler (ürünler, tüketim geçmişi, fiş kayıtları)
  kalıcı olarak ve kademeli şekilde temizlenir

### 🥫 Kiler Yönetimi
- Ürünleri manuel veya fiş taratarak ekleme
- Otomatik raf ömrü tahmini (küratörlü referans tablosu + tanınmayan ürünler için
  AI destekli tahmin)
- Manuel son kullanma tarihi girme/geçersiz kılma
- Arama, çoklu kritere göre sıralama (yeni eklenen / isim / SKT / kategori)
- Ürün adına göre otomatik kategori sınıflandırması (Süt Ürünleri, Meyve & Sebze, vb.)
- Kaydırarak işlem: sağa = tükettim, sola = bozuldu — 4 saniyelik geri al penceresiyle
- Miktar azaltma/sıfırlama akışı: miktar 0'a inince "tükettin mi, bozuldu mu?" onayı

### 📸 Fiş Tarama (OCR + AI)
- Kameradan veya galeriden fiş fotoğrafı yükleme
- Google Cloud Vision ile metin çıkarımı (OCR)
- Market formatından bağımsız, AI destekli (Gemini) birincil ayrıştırma — ürün adı,
  miktar ve birimi gürültüden (mağaza unvanı, vergi no, toplam tutar vb.) ayıklar
- AI kullanılamazsa markete özel regex tabanlı yedek ayrıştırıcılara (A101, Hakmar,
  BİM, Happy Center...) otomatik düşüş
- Onay ekranı: ürünleri tek tek işaretleyip/çıkararak, her birine manuel SKT girerek,
  eksik okunan ürünleri elle ekleyerek kilere aktarma
- Aynı fişin tekrar yüklenmesini dosya özetiyle (hash) engelleme
- Fiş yükleme geçmişi

### 🍳 Tarifler (AI Önerisi)
- Kilerdeki ürünlere göre AI destekli tarif önerileri
- Her öneri, kilerde en acil bozulacak malzemeyi hangi tarifin değerlendirdiğini
  vurgular
- Gerçek, doğrulanabilir bir kaynak tarif linki (Tavily arama API'si) — AI'nin
  ürettiği tarifle karıştırılmadan, "ilgili gerçek tarif" olarak ayrıca sunulur

### 📊 Panel
- Toplam ürün, yakında bozulacak, manuel/tahmini tarihli, tükenmek üzere olan ürün
  sayıları tek bakışta
- Her istatistik kutusu kendi detay ekranına açılır

### 🌱 İsraf Skoru — Oyunlaştırılmış Geri Bildirim
- Üstel sönümlü, ağırlıklı oran tabanlı skor algoritması (yakın zamandaki davranış
  daha ağırlıklı sayılır, ~15 günlük yarı ömür; keyfi sabit eşikler yerine matematiksel
  olarak açıklanabilir bir model)
- Bir ürünü bozulmasına az kala tüketmek "Kurtarma" bonusu kazandırır (skora küçük bir
  ek puan + ayrı, hiç sıfırlanmayan bir sayaç)
- Haftalık / aylık / yıllık / tüm zamanlar kırılımında, takvim birimine göre
  (gün/hafta/ay/yıl) gruplanmış, elle çizilmiş bir çubuk grafik
  (harici grafik kütüphanesi kullanılmadan `react-native` View'leriyle inşa edildi)
  - Bir zaman dilimine dokununca o dönemde tüketilen/bozulan ürünlerin kategori
    kırılımı (yüzdelik) görünür
- Skora göre 5 farklı ruh haline (kritik/düşük/orta/iyi/harika) bürünen özel
  tasarlanmış "Lyx" maskotu; her sekmenin kendi karakter varyasyonu var
- Algoritmanın nasıl çalıştığını anlatan uygulama içi bilgi ekranı

### 🛒 Tüketim Tahmini + Alışveriş Listesi
- Kullanıcının kendi geçmiş tüketim hızından (`toplam tüketilen miktar / gözlem günü`)
  bir ürünün ne zaman tükeneceğini tahmin eden, keyfi sabitlerden kaçınan basit ve
  açıklanabilir bir model
- Tükenmek üzere olan ürünler Panel'de vurgulanır, tek dokunuşla alışveriş listesine
  eklenebilir
- Alışveriş listesi zaten üzerindeyken aynı ürün tahminlerde tekrar gösterilmez
  (yinelenen uyarı/liste kalemi engellenir)
- Manuel ekleme (miktar/birim ile), kategoriye göre gruplanmış görünüm, işaretle/sil
- Hem son kullanma hem tükenme tahminleri için cihaz üzerinde zamanlanan yerel
  bildirimler (uzak push sunucusu gerektirmez, Expo Go'da da çalışır)

### 🎨 Diğer
- Sistem / Açık / Koyu tema desteği, tüm ekranlarda tutarlı uygulanmış
- Uçtan uca özel tasarlanmış arayüz: cam efektli (glassmorphism) giriş ekranları,
  yüzen özel tab bar, özel header bileşenleri

---

## Mimari ve Teknik Kararlar

Projede karşılaşılan ve bilinçli olarak çözülen bazı mühendislik problemleri:

- **AI-öncelikli, deterministik yedekli tasarım** — Fiş ayrıştırma ve raf ömrü
  tahmini önce AI'ye (Gemini) başvurur; AI başarısız olursa (zaman aşımı, kota,
  geçersiz yanıt) sabit kural/regex tabanlı bir yedek sisteme sessizce düşer. Böylece
  sistem tek bir dış servise bağımlı kalmaz.
- **Sunucusuz yerel bildirimler** — Son kullanma ve tükenme hatırlatmaları tamamen
  cihaz üzerinde (`expo-notifications` ile) zamanlanır; uzak push altyapısı
  gerektirmediği için Expo Go'da (geliştirme sürümü) da tam olarak çalışır. Birden
  fazla bildirim türü, birbirini iptal etmeden bağımsız senkronize edilir.
  (`content.data.type` etiketleme deseni.)
- **Türkçe'ye duyarlı metin işleme** — `String.toLowerCase()` Türkçe "İ/I" harflerini
  yanlış dönüştürdüğü için (ör. "MISIR" → "misir" yerine "mısır" olması gerekirken),
  ürün adı normalize etme, arama ve kategori eşleştirme gibi tüm noktalarda
  `toLocaleLowerCase("tr")` tutarlı şekilde kullanılır.
- **Özel tab bar ve header bileşenleri** — React Navigation'ın varsayılan tab bar'ı ve
  native stack header'ının bazı iOS sürümlerinde çözülemeyen düzen kısıtlamaları
  (metin kesilmesi, sistem seviyesinde kapsül biçimli buton sarmalayıcıları) nedeniyle,
  her ikisi de sıfırdan, tam kontrol sağlayan özel bileşenler olarak yeniden yazıldı.
- **İyimser güncellemeler + geri al** — Kaydırarak silme işlemleri anında arayüzden
  kaldırılır, arka planda 4 saniyelik bir pencerede gerçek silme isteği gönderilir;
  bu süre içinde "Geri Al" ile işlem iptal edilebilir.
- **Basit, açıklanabilir algoritmalar** — İsraf skoru ve tüketim hızı tahmini, keyfi
  sabit puanlar yerine matematiksel olarak gerekçelendirilebilir (üstel sönüm, oran
  bazlı) formüllere dayanır — bir tez savunmasında kolayca açıklanabilir olması
  bilinçli bir tasarım tercihidir.

---

## Teknoloji Yığını

### İstemci (`client/`)
| Katman | Teknoloji |
|---|---|
| Çerçeve | React Native 0.81, Expo SDK 54 |
| Dil | TypeScript |
| Yönlendirme | Expo Router (dosya tabanlı) |
| Stil | NativeWind (Tailwind CSS for React Native) |
| Durum/kimlik | React Context (Auth, Theme, İsraf Skoru) + `expo-secure-store` |
| Bildirimler | `expo-notifications` (tamamen yerel/cihaz üzerinde) |
| Görsel | `expo-image`, `expo-blur`, `expo-linear-gradient`, `react-native-svg` |
| Jestler | `react-native-gesture-handler` |
| Diğer | `expo-image-picker`, `@react-native-community/datetimepicker` |

### Sunucu (`receipt-ai/`)
| Katman | Teknoloji |
|---|---|
| Çalışma zamanı | Node.js, Express 5 |
| Veritabanı | MongoDB + Mongoose |
| Kimlik doğrulama | JWT (`jsonwebtoken`), `bcryptjs` |
| Dosya yükleme | `multer` |
| E-posta | `nodemailer` |
| OCR | Google Cloud Vision API |
| AI (fiş ayrıştırma, tarif önerisi, raf ömrü tahmini) | Google Gemini (OpenAI uyumlu istemci üzerinden, `openai` SDK) |
| Gerçek tarif kaynağı arama | Tavily API |

---

## Proje Yapısı

```
akilli-kiler/
├── client/                      # React Native (Expo) mobil uygulama
│   └── src/
│       ├── app/                 # Expo Router ekranları (dosya tabanlı yönlendirme)
│       │   ├── (auth)/          # Giriş, kayıt, şifre sıfırlama
│       │   └── (app)/
│       │       └── (tabs)/      # Kiler, Fiş Tara, Tarifler, Panel
│       ├── components/          # Paylaşılan UI bileşenleri
│       ├── context/             # Auth / Tema / İsraf Skoru context'leri
│       └── lib/                 # API istemcisi, yardımcı fonksiyonlar
│
└── receipt-ai/                  # Node.js/Express REST API
    ├── routes/                  # Uç noktalar (auth, products, upload, recipes, ...)
    ├── services/                # İş mantığı (AI istemcileri, fiş ayrıştırıcılar, ...)
    │   └── parsers/             # Markete özel regex tabanlı yedek ayrıştırıcılar
    ├── models/                  # Mongoose şemaları
    └── middleware/               # JWT doğrulama
```

---

## Kurulum

### Gereksinimler
- Node.js 18+
- MongoDB (yerel veya Atlas)
- Bir Google Cloud Vision servis hesabı anahtarı (fiş OCR için)
- Bir Gemini API anahtarı (AI destekli özellikler için)
- Fiziksel bir telefonda test için: [Expo Go](https://expo.dev/go)

### Sunucu (`receipt-ai/`)

```bash
cd receipt-ai
npm install
cp .env.example .env   # değerleri kendi bilgilerinizle doldurun
npm run dev
```

### İstemci (`client/`)

```bash
cd client
npm install
npx expo start --lan
```

Telefonunuzun kamerasıyla çıkan QR kodu okutup Expo Go'da açabilir, ya da bir
iOS/Android emülatöründe çalıştırabilirsiniz. İstemcinin sunucuya ulaşabilmesi için
`client/src/lib/config.ts` içindeki `API_BASE_URL`'in bilgisayarınızın yerel ağ
IP adresiyle eşleşmesi gerekir.

---

## Ortam Değişkenleri

Sunucu tarafının ihtiyaç duyduğu tüm değişkenler `receipt-ai/.env.example` içinde
örneklenmiştir. Gerçek değerlerinizi içeren `.env` dosyası asla commit edilmemelidir
(`.gitignore` ile hariç tutulmuştur).

---

## API Genel Bakış

Tüm uç noktalar `/api` altında toplanır; `/api/auth` dışındakiler `Authorization:
Bearer <token>` başlığı gerektirir.

| Grup | Örnek uç noktalar |
|---|---|
| Kimlik doğrulama | `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password`, `DELETE /api/auth/account` |
| Ürünler | `GET/POST /api/products`, `GET /api/products/expiring-soon`, `POST /api/products/bulk` |
| Fiş yükleme | `POST /api/upload`, `GET /api/upload/history` |
| Tarifler | `GET /api/recipes/suggest` |
| Panel | `GET /api/dashboard/summary` |
| İsraf Skoru | `GET /api/waste-score?range=week\|month\|year\|all` |
| Tüketim tahmini | `GET /api/predictions/running-low` |
| Alışveriş listesi | `GET/POST /api/shopping-list`, `PATCH/DELETE /api/shopping-list/:id` |
