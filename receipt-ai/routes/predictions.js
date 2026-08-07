const express = require("express");
const { predictRunningLow } = require("../services/consumptionPrediction");

const router = express.Router();

router.get("/running-low", async (req, res) => {
  try {
    const products = await predictRunningLow(req.userId);

    res.json({
      message: "Tükenmek üzere olan ürünler hesaplandı.",
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      message: "Tüketim tahmini hesaplanırken hata oluştu.",
      error: error.message,
    });
  }
});

module.exports = router;
