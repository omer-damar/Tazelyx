const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
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
      required: true,
      min: [0, "Miktar negatif olamaz."],
    },
    unit: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      default: "receipt",
    },
    estimatedShelfLifeDays: {
      type: Number,
      default: 7,
    },
    estimatedExpireDate: {
      type: Date,
      default: null,
    },
    manualExpireDate: {
      type: Date,
      default: null,
    },
    effectiveExpireDate: {
      type: Date,
      default: null,
    },
    expireDateSource: {
      type: String,
      enum: ["estimated", "manual"],
      default: "estimated",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Product", productSchema);