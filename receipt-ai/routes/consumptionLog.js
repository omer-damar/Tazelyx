const express = require("express");
const ConsumptionLog = require("../models/ConsumptionLog");
const { safeErrorDetail } = require("../utils/errorResponse");

const router = express.Router();

// Ham tüketim kayıtlarını listeler. Ürün bazında özetlenmiş tüketim hızı
// tahmini için bkz. routes/predictions.js.
router.get("/", async (req, res) => {
  try {
    const logs = await ConsumptionLog.find({ userId: req.userId }).sort({ createdAt: -1 });

    res.json({
      message: "Tüketim kayıtları getirildi.",
      count: logs.length,
      logs,
    });
  } catch (error) {
    res.status(500).json({
      message: "Tüketim kayıtları getirilirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

module.exports = router;
