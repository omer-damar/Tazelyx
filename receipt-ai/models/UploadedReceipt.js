const mongoose = require("mongoose");

// Yüklenen her fişin dosya içeriğinin SHA-256 özeti burada tutulur. Aynı
// kullanıcı aynı fişi (kazayla) ikinci kez yüklerse, routes/upload.js bu
// kayıttan tespit edip OCR/parse işlemini tekrar çalıştırmadan reddeder.
// Bilerek kullanıcı bazlı: iki farklı kullanıcının fişleri asla aynı hash'i
// paylaşmaz (gerçekten byte-byte aynı dosya olmadıkça), ama yine de kapsamı
// kullanıcıya bağlıyoruz ki biri diğerinin fişini yüklediğinde yanlışlıkla
// engellenmesin.
const uploadedReceiptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileHash: {
      type: String,
      required: true,
    },
    originalFilename: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

uploadedReceiptSchema.index({ userId: 1, fileHash: 1 }, { unique: true });

module.exports = mongoose.model("UploadedReceipt", uploadedReceiptSchema);
