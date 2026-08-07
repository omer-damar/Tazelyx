const express = require("express");
const Product = require("../models/Product");
const { startOfToday } = require("../services/shelfLife");
const { predictRunningLow } = require("../services/consumptionPrediction");
const config = require("../config");

const router = express.Router();

router.get("/summary", async (req, res) => {
  try {
    const now = new Date();

    // Miktarı 0 olan (tüketilmiş ama silinmemiş) ürünler dışarıda bırakılır,
    // böylece bu sayılar veritabanındaki ham kayıt sayısını değil aktif
    // kiler durumunu yansıtır.
    const activeProductFilter = { userId: req.userId, quantity: { $gt: 0 } };

    const totalProducts = await Product.countDocuments(activeProductFilter);

    const expiringSoon = await Product.countDocuments({
      ...activeProductFilter,
      effectiveExpireDate: {
        // routes/products.js > GET /expiring-soon ile aynı gerekçe: alt
        // sınır `now` yerine takvim gününün başlangıcı, "bugün bozuluyor"
        // rozetiyle tutarlı olsun diye (bkz. services/shelfLife.js > startOfToday).
        $gte: startOfToday(),
        $lte: new Date(
          now.getTime() + config.EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
        ),
      },
    });

    const manualExpire = await Product.countDocuments({
      ...activeProductFilter,
      expireDateSource: "manual",
    });

    const estimatedExpire = await Product.countDocuments({
      ...activeProductFilter,
      expireDateSource: "estimated",
    });

    const runningLowProducts = await predictRunningLow(req.userId);

    res.json({
      totalProducts,
      expiringSoon,
      manualExpire,
      estimatedExpire,
      runningLow: runningLowProducts.length,
    });
  } catch (error) {
    res.status(500).json({
      message: "Dashboard verisi alınamadı",
      error: error.message,
    });
  }
});

module.exports = router;
