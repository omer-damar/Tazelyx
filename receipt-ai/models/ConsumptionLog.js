const mongoose = require("mongoose");

// Kullanıcının tüketim/israf davranışını zaman içinde izleyen ham veri
// kaydı; tüketim hızı tahmini (services/consumptionPrediction.js) ve
// İsraf Skoru (services/wasteScore.js) bu kayıtları temel alır.
const consumptionLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      enum: ["consumed", "expired", "quantity_reduced", "unspecified"],
      default: "unspecified",
    },
    // Ürün, bozulmasına (effectiveExpireDate) EXPIRING_SOON_DAYS gün veya
    // daha az kala "consumed" olarak işaretlenmişse true — İsraf Skoru'nun
    // kurtarma bonusu/rozeti bu alanı okuyor. bkz. services/wasteScore.js
    wasRescue: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ConsumptionLog", consumptionLogSchema);
