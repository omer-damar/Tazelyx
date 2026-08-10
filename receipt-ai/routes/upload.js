const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { extractTextFromImage } = require("../services/ocr");
const { parseReceiptText, UnsupportedStoreError } = require("../services/parsers");
const { parseReceiptWithAi } = require("../services/receiptAi");
const UploadedReceipt = require("../models/UploadedReceipt");
const { cleanDisplayName } = require("../services/shelfLife");
const { normalizeUnit } = require("../services/productValidation");
const { safeErrorDetail } = require("../utils/errorResponse");
const config = require("../config");

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // Date.now() + randomUUID: yalnızca Date.now() kullanmak, aynı
    // milisaniyede gelen eşzamanlı yüklemelerde veya orijinal dosya adında
    // sorunlu karakterler varsa çakışma/hata riski taşır.
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

// Yalnızca gerçekçi fiş formatları (görsel/PDF) ve makul bir boyut sınırı
// (config.js üzerinden) kabul edilir.
const upload = multer({
  storage,
  limits: { fileSize: config.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (config.ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Desteklenmeyen dosya türü. Sadece JPEG, PNG, WEBP veya PDF yükleyebilirsiniz."
        )
      );
    }
  },
});

router.post("/upload", (req, res) => {
  upload.single("receipt")(req, res, async function (err) {
    if (err) {
      return res.status(400).json({
        message: "Dosya yükleme hatası",
        error: safeErrorDetail(err),
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Dosya bulunamadı. form-data içinde 'receipt' alanı ile gönder.",
      });
    }

    try {
      // Mükerrer fiş tespiti: aynı kullanıcı aynı dosyayı (byte-byte aynı,
      // ör. kazayla iki kez yüklenmiş) tekrar yüklerse, OCR/parse işlemini
      // (maliyetli AI/Vision çağrıları) hiç çalıştırmadan reddediyoruz.
      const fileBuffer = fs.readFileSync(req.file.path);
      const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

      const existingUpload = await UploadedReceipt.findOne({
        userId: req.userId,
        fileHash,
      });

      if (existingUpload) {
        return res.status(409).json({
          message: "Bu fiş daha önce yüklenmiş (aynı dosya tespit edildi).",
          uploadedAt: existingUpload.createdAt,
        });
      }

      const text = await extractTextFromImage(req.file.path);

      // Ayrıştırma önceliği AI'da: regex tabanlı market parser'ları
      // (services/parsers/) her yeni market için elle bakım gerektirir ve
      // desteklenen marketlerde bile mağaza adı/vergi no gibi satırları ürün
      // sanabilir. AI, fiş metnini market formatından bağımsız okuyup sadece
      // gerçek ürünleri çıkarır. AI çağrısı başarısız olursa (zaman aşımı/
      // kota/geçersiz yanıt), desteklenen marketler için regex parser'a
      // düşülür — tamamen elimiz boş kalmasın diye bu yedek yol korunuyor.
      let rawParsedProducts;
      try {
        const aiResult = await parseReceiptWithAi(text);
        rawParsedProducts = aiResult.products;
      } catch (aiError) {
        console.warn("AI fiş ayrıştırma başarısız, regex parser'a düşülüyor:", aiError.message);
        try {
          rawParsedProducts = parseReceiptText(text);
        } catch (regexError) {
          if (regexError instanceof UnsupportedStoreError) {
            rawParsedProducts = [];
          } else {
            throw regexError;
          }
        }
      }

      // Ürünler burada otomatik kaydedilmez. OCR bazen fişteki mağaza/vergi
      // bilgisi gibi ürün olmayan satırları da yakalayabildiğinden, kullanıcı
      // önce hangi kalemleri kilere eklemek istediğini seçip isteğe bağlı
      // olarak ürün bazlı son kullanma tarihi girer; bu yüzden burada sadece
      // TEMİZLENMİŞ (ad/birim normalize edilmiş) hâliyle önizleme dönülür.
      // Gerçek kayıt, kullanıcının onayıyla POST /api/products/bulk'a düşer.
      const parsedProducts = rawParsedProducts.map((product) => ({
        name: cleanDisplayName(product.name),
        quantity: product.quantity,
        unit: normalizeUnit(product.unit),
      }));

      // Aynı fişin tekrar yüklenmesinde OCR'ı (maliyetli Vision API çağrısını)
      // tekrar çalıştırmamak için hash'i burada, kullanıcı henüz hiçbir ürünü
      // onaylamamış olsa bile kaydediyoruz — bkz. yukarıdaki mükerrer fiş
      // kontrolü.
      await UploadedReceipt.create({
        userId: req.userId,
        fileHash,
        originalFilename: req.file.originalname,
      });

      res.json({
        message: "Fiş okundu, ürünleri incele ve kilere eklemek istediklerini onayla.",
        extractedText: text,
        parsedProducts,
      });
    } catch (ocrError) {
      // Desteklenmeyen bir market fişi, OCR/parser'ın bir hatası değil;
      // bu yüzden 500 yerine ayrı ve daha açıklayıcı bir kod dönüyoruz.
      if (ocrError instanceof UnsupportedStoreError) {
        return res.status(422).json({
          message: ocrError.message,
          store: ocrError.store,
        });
      }

      res.status(500).json({
        message: "OCR işlemi başarısız",
        error: safeErrorDetail(ocrError),
      });
    } finally {
      // Yüklenen dosyanın tek amacı OCR'a verilmekti; sonuç ne olursa olsun
      // diskte tutulmasına gerek yok — aksi halde uploads/ zamanla sınırsız
      // büyür (hiçbir şey onu temizlemiyordu).
      fs.unlink(req.file.path, () => {});
    }
  });
});

// Kullanıcının daha önce yüklediği fişlerin basit bir dökümü (dosya adı +
// tarih) — hangi fişi ne zaman yüklediğini görebilsin diye. Fişin kendisi
// (görsel dosyası) burada dönmüyor, sadece `UploadedReceipt` kaydındaki
// meta bilgiler.
router.get("/upload/history", async (req, res) => {
  try {
    const receipts = await UploadedReceipt.find({ userId: req.userId }).sort({ createdAt: -1 });

    res.json({
      message: "Fiş geçmişi getirildi.",
      count: receipts.length,
      receipts,
    });
  } catch (error) {
    res.status(500).json({
      message: "Fiş geçmişi getirilirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

module.exports = router;
