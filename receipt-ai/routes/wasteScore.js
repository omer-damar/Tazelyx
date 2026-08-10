const express = require("express");
const { computeWasteScore, isValidRange } = require("../services/wasteScore");
const { safeErrorDetail } = require("../utils/errorResponse");

const router = express.Router();

// GET /api/waste-score?range=week|month|year|all — range verilmezse tüm
// geçmiş, sert bir kesim olmadan üstel sönümle değerlendirilir (bkz.
// services/wasteScore.js). Maskot/rozet gibi her yerde görünen "ana" skor
// bu varsayılanı kullanıyor; Skor detay ekranı range parametresini geçiyor.
router.get("/", async (req, res) => {
  try {
    const range = req.query.range;

    if (!isValidRange(range)) {
      return res.status(400).json({
        message: "Geçersiz range. İzin verilenler: week, month, year, all.",
      });
    }

    const result = await computeWasteScore(req.userId, range);

    res.json({
      message: "İsraf skoru hesaplandı.",
      range: range || "all",
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      message: "İsraf skoru hesaplanırken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

module.exports = router;
