const mongoose = require("mongoose");

const shoppingListItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      default: null,
    },
    unit: {
      type: String,
      default: null,
    },
    isChecked: {
      type: Boolean,
      default: false,
    },
    // "prediction": tüketim hızı tahminine göre kullanıcının ONAYIYLA
    // eklendi (bkz. services/consumptionPrediction.js) — otomatik değil,
    // her zaman kullanıcının kendi dokunuşuyla listeye giriyor.
    source: {
      type: String,
      enum: ["manual", "prediction"],
      default: "manual",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ShoppingList", shoppingListItemSchema);
