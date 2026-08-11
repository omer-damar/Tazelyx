require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");

// JWT_SECRET eksikse sunucu yine de ayağa kalkıp ilk girişte 500 verirdi;
// bunun yerine boot anında net bir hatayla durduruyoruz. .env.example'daki
// placeholder değer de reddediliyor — aksi halde onu değiştirmeyi unutan
// her deploy, herkesçe bilinen aynı imzalama anahtarını paylaşır ve JWT
// sahteciliğine açık kalır.
const jwtSecret = process.env.JWT_SECRET || "";
if (jwtSecret.length < 32 || jwtSecret === "change-this-to-a-long-random-string") {
  console.error(
    "JWT_SECRET tanımlı değil, çok kısa (en az 32 karakter gerekli) veya .env.example'daki " +
      "placeholder değerde bırakılmış. .env dosyasında uzun, rastgele bir değerle ayarlanmalı."
  );
  process.exit(1);
}

// Bağlantı adresi ve port .env dosyasından okunur; tanımlı değilse yerel
// geliştirme için makul bir varsayılana düşülür.
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/akilli-kiler";
const PORT = process.env.PORT || 4000;

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB bağlantısı başarılı"))
  .catch((err) => console.error("MongoDB bağlantı hatası:", err.message));

app.listen(PORT, () => {
  console.log(`OCR service running on port ${PORT}`);
});
