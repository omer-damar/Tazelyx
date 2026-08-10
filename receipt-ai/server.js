const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const authRoute = require("./routes/auth");
const uploadRoute = require("./routes/upload");
const productsRoute = require("./routes/products");
const recipesRoute = require("./routes/recipes");
const dashboardRoute = require("./routes/dashboard");
const consumptionLogRoute = require("./routes/consumptionLog");
const wasteScoreRoute = require("./routes/wasteScore");
const shoppingListRoute = require("./routes/shoppingList");
const predictionsRoute = require("./routes/predictions");
const { requireAuth } = require("./middleware/auth");
const { safeErrorDetail } = require("./utils/errorResponse");

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

const app = express();

app.use(cors());
app.use(express.json());

// Bağlantı adresi ve port .env dosyasından okunur; tanımlı değilse yerel
// geliştirme için makul bir varsayılana düşülür.
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/akilli-kiler";
const PORT = process.env.PORT || 4000;

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB bağlantısı başarılı"))
  .catch((err) => console.error("MongoDB bağlantı hatası:", err.message));

app.get("/", (req, res) => {
  res.send("Receipt OCR Service Running");
});

// E-posta onayı/şifre sıfırlama HTML sayfalarında marka logosunu gösterebilmek
// için herkese açık statik dosya servisi (bkz. routes/auth.js).
app.use("/assets", express.static(path.join(__dirname, "assets")));

// ÖNEMLİ: Bu, herkese açık kalması gereken bir health-check uç noktası —
// bu yüzden aşağıdaki "/api" önekiyle eşleşen requireAuth middleware'inden
// ÖNCE tanımlanmalı; aksi halde istek önce requireAuth'a düşer, 401 döner
// ve kendi handler'ına hiç ulaşmaz.
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "akilli-kiler-api",
    time: new Date(),
  });
});

// /api/auth herkese açık (kayıt/giriş); aşağıdaki uygulama route'larının
// hepsi requireAuth ile korunuyor — her istek geçerli bir JWT gerektiriyor
// ve req.userId'ye göre veriyi filtreliyor.
app.use("/api/auth", authRoute);
app.use("/api", requireAuth, uploadRoute);
app.use("/api/products", requireAuth, productsRoute);
app.use("/api/recipes", requireAuth, recipesRoute);
app.use("/api/dashboard", requireAuth, dashboardRoute);
app.use("/api/consumption-log", requireAuth, consumptionLogRoute);
app.use("/api/waste-score", requireAuth, wasteScoreRoute);
app.use("/api/shopping-list", requireAuth, shoppingListRoute);
app.use("/api/predictions", requireAuth, predictionsRoute);

// Tanımlı hiçbir route ile eşleşmeyen istekler için düzgün bir 404 yanıtı.
// Bu middleware olmadan Express 5, bilinmeyen adresler için varsayılan
// (kullanıcı dostu olmayan) bir HTML sayfası döndürüyordu.
app.use((req, res) => {
  res.status(404).json({ message: "İstenen adres bulunamadı." });
});

// Merkezi hata yakalama middleware'i (son güvenlik ağı).
// Route içindeki try/catch bloklarından kaçan veya senkron olmayan
// beklenmeyen hatalar buraya düşer ve tutarlı bir JSON formatında döner.
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: "Sunucuda beklenmeyen bir hata oluştu.",
    error: safeErrorDetail(err),
  });
});

app.listen(PORT, () => {
  console.log(`OCR service running on port ${PORT}`);
});
