const Product = require("../models/Product");
const ConsumptionLog = require("../models/ConsumptionLog");
const ShoppingList = require("../models/ShoppingList");
const config = require("../config");

const DAY_MS = 24 * 60 * 60 * 1000;

// Bir ürünün ne zaman TÜKENECEĞİNİ (bozulma tarihinden BAĞIMSIZ bir kavram —
// bkz. SKT tahmini) kullanıcının kendi geçmiş tüketim hızından tahmin eder.
// Formül bilinçli olarak basit tutuldu (İsraf Skoru'ndaki "keyfi sabitlerden
// kaçın" prensibiyle aynı ruhta):
//
//   günlük_hız = (bu üründen bugüne kadar TÜKETİLEN toplam miktar) / (gözlem gün sayısı)
//   tahmini_kalan_gün = mevcut_miktar / günlük_hız
//
// "Tüketilen miktar", ConsumptionLog'daki "consumed" (tamamen tüketildi) ve
// "quantity_reduced" (kısmen azaltıldı) kayıtlarının toplamı — "expired"
// (bozuldu, atıldı) ve "unspecified" İSRAF'tır, tüketim HIZINA dahil
// edilmemeli (aksi halde "hızlı tüketiyor" gibi görünüp yanlış erken uyarı
// verir).
async function predictRunningLow(userId) {
  const activeProducts = await Product.find({ userId, quantity: { $gt: 0 } }).lean();
  if (activeProducts.length === 0) return [];

  // Kullanıcı bir ürünü ("Ekle" ile, kaynağı fark etmeksizin — manuel de
  // olabilir) zaten alışveriş listesine eklediyse, kilerdeki miktar
  // GERÇEKTEN artmamış olsa bile aynı ürünü tekrar tekrar "tükenmek üzere"
  // diye göstermek gereksiz/rahatsız edici — kullanıcı zaten "hallediyorum"
  // demiş oluyor. İşaretlenmemiş (henüz satın alınmamış) kalemler dışarıda
  // tutuluyor; ürün gerçekten kilerde yeniden stoklanana ya da listeden
  // çıkarılana/işaretlenene kadar tahminlerden hariç tutulur.
  const listedNames = await ShoppingList.find({ userId, isChecked: false })
    .select("name")
    .lean();
  const listedNameSet = new Set(
    listedNames.map((item) => item.name.trim().toLocaleLowerCase("tr"))
  );

  const now = Date.now();
  const predictions = [];

  for (const product of activeProducts) {
    if (listedNameSet.has(product.name.trim().toLocaleLowerCase("tr"))) continue;

    const logs = await ConsumptionLog.find({
      userId,
      productName: product.name,
      reason: { $in: ["consumed", "quantity_reduced"] },
    })
      .sort({ createdAt: 1 })
      .select("quantity createdAt")
      .lean();

    if (logs.length === 0) continue;

    const totalUsed = logs.reduce((sum, log) => sum + log.quantity, 0);
    const earliest = new Date(logs[0].createdAt).getTime();
    const observationDays = (now - earliest) / DAY_MS;

    if (observationDays < config.MIN_CONSUMPTION_OBSERVATION_DAYS || totalUsed <= 0) continue;

    const dailyRate = totalUsed / observationDays;
    if (dailyRate <= 0) continue;

    const predictedDaysRemaining = product.quantity / dailyRate;
    if (predictedDaysRemaining > config.RUNNING_LOW_DAYS) continue;

    predictions.push({
      productId: product._id,
      name: product.name,
      quantity: product.quantity,
      unit: product.unit,
      dailyRate: Math.round(dailyRate * 1000) / 1000,
      predictedDaysRemaining: Math.round(predictedDaysRemaining * 10) / 10,
    });
  }

  return predictions.sort((a, b) => a.predictedDaysRemaining - b.predictedDaysRemaining);
}

module.exports = { predictRunningLow };
