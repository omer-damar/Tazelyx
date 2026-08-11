const path = require("path");
const express = require("express");
const cors = require("cors");

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

// Express app'in tanımı, gerçek bir MongoDB bağlantısı kurmadan ve
// app.listen() çağırmadan burada tutuluyor — böylece integration testleri
// (bkz. tests/integration/) supertest ile bu app'i doğrudan içe aktarıp
// gerçek bir port dinlemeden istek gönderebiliyor. Gerçek süreç başlatma
// (dotenv, mongoose.connect, app.listen) server.js'te.
const app = express();

// Mobil istemci (Expo Go / React Native) bir tarayıcı değil, isteklerinde
// Origin başlığı hiç göndermiyor — bu yüzden origin `undefined` olan
// istekler (uygulamamız + curl/Postman gibi araçlar) her zaman kabul
// edilir. Tarayıcıdan gelen istekler ise SADECE ALLOWED_ORIGINS'te (.env,
// virgülle ayrılmış) açıkça izin verilen adreslerden kabul edilir.
// ALLOWED_ORIGINS hiç tanımlanmamışsa (yerel geliştirme varsayılanı) eski
// davranışa (tamamen açık) düşülür — prod'a taşınırken bu env değişkeni
// mutlaka ayarlanmalı.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin:
      ALLOWED_ORIGINS.length === 0
        ? true
        : (origin, callback) => {
            if (!origin || ALLOWED_ORIGINS.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error("CORS: bu origin'e izin verilmiyor."));
            }
          },
  })
);
app.use(express.json());

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

module.exports = app;
