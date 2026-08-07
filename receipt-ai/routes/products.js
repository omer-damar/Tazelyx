const express = require("express");
const mongoose = require("mongoose");
const Product = require("../models/Product");
const {
  buildExpireInfo,
  cleanDisplayName,
  getEstimatedShelfLifeDays,
  addDaysToDate,
  startOfToday,
} = require("../services/shelfLife");
const {
  getUsableForRecipeProducts,
  getProductSummaryByName,
} = require("../services/productQueries");
const { logConsumption } = require("../services/consumptionLog");
const { normalizeUnit, isValidUnit } = require("../services/productValidation");
const config = require("../config");

const router = express.Router();

// Geçersiz formatta bir ID (örn. "abc123") Mongoose'un CastError'ını
// fırlatır ve bu genel catch bloğunda 500 (sunucu hatası) olarak döner —
// oysa bu bir istemci hatasıdır (400). Bu yardımcı fonksiyon, veritabanına
// gitmeden önce ID formatını kontrol edip doğru hata koduyla erken
// dönülmesini sağlar.
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Tüm ürünleri listele
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ userId: req.userId }).sort({ createdAt: -1 });

    res.json({
      message: "Ürünler getirildi.",
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ürünler getirilirken hata oluştu.",
      error: error.message,
    });
  }
});

// Bozulmaya yaklaşan ürünleri getiriyoruz
router.get("/expiring-soon", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || config.EXPIRING_SOON_DAYS;

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + days);

    const products = await Product.find({
      userId: req.userId,
      effectiveExpireDate: {
        $ne: null,
        // Alt sınır takvim gününün başlangıcı (`startOfToday()`), `now`
        // (saniye hassasiyetinde) değil — bu, bugün bozulan ama saati
        // geçmiş bir ürünün de "Bugün bozuluyor" rozetiyle (gün bazlı
        // hesaplayan ExpireBadge.tsx) tutarlı şekilde listelenmesini sağlar.
        $gte: startOfToday(),
        $lte: futureDate,
      },
      // Miktarı 0 olan (zaten tüketilmiş ama silinmemiş) ürünler hariç
      // tutulur, aksi halde kullanıcıya kullanılmış bir ürün için "bozulacak"
      // uyarısı gösterilir.
      quantity: { $gt: 0 },
    }).sort({ effectiveExpireDate: 1 });

    res.json({
      message: `${days} gün içinde bozulacak ürünler getirildi.`,
      count: products.length,
      products,
    });
  } catch (error) {
    res.status(500).json({
      message: "Bozulmaya yaklaşan ürünler getirilirken hata oluştu.",
      error: error.message,
    });
  }
});

// Manuel son tüketim tarihi girme modülümüz
router.patch("/:id/manual-expire-date", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Geçersiz ürün ID formatı." });
    }

    const manualExpireDate = req.body?.manualExpireDate;

    if (!manualExpireDate) {
      return res.status(400).json({
        message: "manualExpireDate gerekli.",
      });
    }

    const parsedDate = new Date(manualExpireDate);

    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        message: "Geçersiz tarih formatı.",
      });
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id, userId: req.userId },
      {
        manualExpireDate: parsedDate,
        effectiveExpireDate: parsedDate,
        expireDateSource: "manual",
      },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        message: "Ürün bulunamadı.",
      });
    }

    res.json({
      message: "Manuel son tüketim tarihi güncellendi.",
      product: updatedProduct,
    });
  } catch (error) {
    res.status(500).json({
      message: "Güncelleme sırasında hata oluştu.",
      error: error.message,
    });
  }
});

// Tarif için kullanılabilecek ürünleri getir
router.get("/usable-for-recipes", async (req, res) => {
  try {
    const products = await getUsableForRecipeProducts(req.userId);
    const ingredients = products.map((p) => p.name);

    res.json({
      message: "Tarif için kullanılabilir ürünler getirildi.",
      count: ingredients.length,
      ingredients,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ürünler getirilirken hata oluştu.",
      error: error.message,
    });
  }
});

// Aynı üründen birden fazla parti varsa (ör. iki ayrı süt kaydı), bunları
// isme göre gruplayıp toplam miktarı gösteren bir özet. Alttaki kayıtlar
// (her partinin kendi bozulma tarihi) hiç değişmeden kalır, bu sadece
// görüntüleme amaçlı — bkz. services/productQueries.js.
router.get("/summary-by-name", async (req, res) => {
  try {
    const summary = await getProductSummaryByName(req.userId);

    res.json({
      message: "Ürün özeti (isme göre gruplanmış) getirildi.",
      summary,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ürün özeti getirilirken hata oluştu.",
      error: error.message,
    });
  }
});

// { name, quantity, unit, manualExpireDate } girdisini doğrulayıp kaydedilecek
// bir Product dokümanına çevirir — hem tekli manuel ekleme (POST /) hem de
// fiş inceleme ekranından toplu onay (POST /bulk) BU FONKSİYONU paylaşıyor,
// böylece doğrulama/raf-ömrü mantığı iki yerde ayrı ayrı yazılmıyor.
async function buildProductInput({ name, quantity, unit, manualExpireDate }) {
  if (!name || quantity === undefined || !unit) {
    throw Object.assign(new Error("name, quantity ve unit alanları gerekli."), { status: 400 });
  }

  if (typeof quantity !== "number" || quantity < 0) {
    throw Object.assign(new Error("quantity negatif olmayan bir sayı olmalı."), { status: 400 });
  }

  const normalizedUnit = normalizeUnit(unit);
  if (!isValidUnit(normalizedUnit)) {
    throw Object.assign(
      new Error(`Geçersiz birim. İzin verilenler: ${config.ALLOWED_UNITS.join(", ")}.`),
      { status: 400 }
    );
  }

  const displayName = cleanDisplayName(name);
  const expireInfo = await buildExpireInfo(displayName, manualExpireDate || null);

  return {
    name: displayName,
    quantity,
    unit: normalizedUnit,
    ...expireInfo,
  };
}

// Manuel ürün ekle
router.post("/", async (req, res) => {
  try {
    const productInput = await buildProductInput(req.body);

    const newProduct = await Product.create({
      userId: req.userId,
      source: "manual",
      ...productInput,
    });

    res.status(201).json({
      message: "Ürün manuel olarak eklendi.",
      product: newProduct,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.status ? error.message : "Ürün eklenirken hata oluştu.",
      error: error.status ? undefined : error.message,
    });
  }
});

// Fiş inceleme ekranından kullanıcının onayladığı ürünleri toplu kaydet
// (bkz. routes/upload.js — OCR artık otomatik kaydetmiyor, sadece önizleme
// dönüyor; gerçek kayıt kullanıcının seçimiyle buraya düşüyor).
router.post("/bulk", async (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "products alanı boş olmayan bir dizi olmalı." });
    }

    const productInputs = await Promise.all(
      products.map((product) => buildProductInput(product))
    );

    const createdProducts = await Product.insertMany(
      productInputs.map((input) => ({
        userId: req.userId,
        source: "receipt",
        ...input,
      }))
    );

    res.status(201).json({
      message: `${createdProducts.length} ürün kilerine eklendi.`,
      count: createdProducts.length,
      products: createdProducts,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.status ? error.message : "Ürünler eklenirken hata oluştu.",
      error: error.status ? undefined : error.message,
    });
  }
});

// Tek ürün getir
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Geçersiz ürün ID formatı." });
    }

    const product = await Product.findOne({ _id: id, userId: req.userId });

    if (!product) {
      return res.status(404).json({
        message: "Ürün bulunamadı.",
      });
    }

    res.json({
      message: "Ürün getirildi.",
      product,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ürün getirilirken hata oluştu.",
      error: error.message,
    });
  }
});

// Genel ürün güncelle
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Geçersiz ürün ID formatı." });
    }

    const { name, quantity, unit, manualExpireDate } = req.body;

    if (quantity !== undefined && (typeof quantity !== "number" || quantity < 0)) {
      return res.status(400).json({
        message: "quantity negatif olmayan bir sayı olmalı.",
      });
    }

    let normalizedUnit;
    if (unit !== undefined) {
      normalizedUnit = normalizeUnit(unit);
      if (!isValidUnit(normalizedUnit)) {
        return res.status(400).json({
          message: `Geçersiz birim. İzin verilenler: ${config.ALLOWED_UNITS.join(", ")}.`,
        });
      }
    }

    const updateData = {};

    if (quantity !== undefined) updateData.quantity = quantity;
    if (unit !== undefined) updateData.unit = normalizedUnit;

    // Ürünün mevcut hâlini, hem isim hem manuel tarih hem de miktar
    // azalışını tespit etmek (bkz. aşağıdaki tüketim logu) için en baştan
    // (tek seferde) çekiyoruz.
    let existingProduct = null;
    if (
      name !== undefined ||
      manualExpireDate !== undefined ||
      quantity !== undefined
    ) {
      existingProduct = await Product.findOne({ _id: id, userId: req.userId });
      if (!existingProduct) {
        return res.status(404).json({ message: "Ürün bulunamadı." });
      }
    }

    if (name !== undefined) {
      const displayName = cleanDisplayName(name);
      updateData.name = displayName;

      // İsim değiştiğinde raf ömrü ve tahmini son kullanma tarihi yeniden
      // hesaplanır — aksi halde OCR'ın yanlış okuduğu bir isim ("domates"
      // yerine "süt" gibi) düzeltildiğinde sistem eski ismin raf ömrünü
      // kullanmaya devam eder. getEstimatedShelfLifeDays kendi içinde ASCII
      // normalize ettiği için Türkçe karakterli displayName doğrudan verilir.
      const estimatedShelfLifeDays = await getEstimatedShelfLifeDays(displayName);
      const estimatedExpireDate = addDaysToDate(new Date(), estimatedShelfLifeDays);

      updateData.estimatedShelfLifeDays = estimatedShelfLifeDays;
      updateData.estimatedExpireDate = estimatedExpireDate;

      // Kullanıcı bu isteğin içinde ayrıca manualExpireDate göndermiyorsa
      // ve daha önce manuel bir tarih girilmemişse, yeni hesaplanan tahmini
      // tarihi esas alınan tarih olarak güncelliyoruz. Eğer kullanıcı daha
      // önce manuel bir tarih girmişse, o tercihi isim değişikliğiyle
      // ezmiyoruz; aşağıdaki manualExpireDate bloğu varsa son sözü o söyler.
      if (
        existingProduct.expireDateSource !== "manual" &&
        manualExpireDate === undefined
      ) {
        updateData.effectiveExpireDate = estimatedExpireDate;
      }
    }

    if (manualExpireDate !== undefined) {
      if (manualExpireDate === null || manualExpireDate === "") {
        updateData.manualExpireDate = null;
        updateData.effectiveExpireDate =
          updateData.estimatedExpireDate ?? existingProduct.estimatedExpireDate;
        updateData.expireDateSource = "estimated";
      } else {
        const parsedDate = new Date(manualExpireDate);

        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({
            message: "Geçersiz tarih formatı.",
          });
        }

        updateData.manualExpireDate = parsedDate;
        updateData.effectiveExpireDate = parsedDate;
        updateData.expireDateSource = "manual";
      }
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id, userId: req.userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        message: "Ürün bulunamadı.",
      });
    }

    // Miktar azaldıysa (ör. 1 kg süt -> 0.7 kg), aradaki fark bir tüketim
    // olarak loglanır; bu veri tüketim hızı tahmininde (services/
    // consumptionPrediction.js) kullanılır.
    if (quantity !== undefined && quantity < existingProduct.quantity) {
      await logConsumption({
        userId: req.userId,
        productName: existingProduct.name,
        quantity: existingProduct.quantity - quantity,
        unit: existingProduct.unit,
        reason: "quantity_reduced",
      });
    }

    res.json({
      message: "Ürün güncellendi.",
      product: updatedProduct,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ürün güncellenirken hata oluştu.",
      error: error.message,
    });
  }
});

// Ürün sil
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Geçersiz ürün ID formatı." });
    }

    // Silme sebebi isteğe bağlı bir query parametresiyle belirtilebilir, ör.
    // DELETE /api/products/:id?reason=expired — frontend ileride "kullandım
    // mı yoksa attın mı" diye sorup bunu gönderebilir. Belirtilmezse
    // "unspecified" olarak kaydedilir.
    const allowedReasons = ["consumed", "expired", "unspecified"];
    const reason = allowedReasons.includes(req.query.reason)
      ? req.query.reason
      : "unspecified";

    const deletedProduct = await Product.findOneAndDelete({ _id: id, userId: req.userId });

    if (!deletedProduct) {
      return res.status(404).json({
        message: "Ürün bulunamadı.",
      });
    }

    // "Kurtarma": ürün bozulmadan hemen önce (EXPIRING_SOON_DAYS gün veya
    // daha az kala) tüketildiyse — bkz. services/wasteScore.js. expiring-soon
    // route'undaki aynı [now, now+EXPIRING_SOON_DAYS] penceresiyle tutarlı.
    let wasRescue = false;
    if (reason === "consumed" && deletedProduct.effectiveExpireDate) {
      const daysUntilExpiry =
        (new Date(deletedProduct.effectiveExpireDate).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000);
      wasRescue = daysUntilExpiry >= 0 && daysUntilExpiry <= config.EXPIRING_SOON_DAYS;
    }

    await logConsumption({
      userId: req.userId,
      productName: deletedProduct.name,
      quantity: deletedProduct.quantity,
      unit: deletedProduct.unit,
      reason,
      wasRescue,
    });

    res.json({
      message: "Ürün silindi.",
      product: deletedProduct,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ürün silinirken hata oluştu.",
      error: error.message,
    });
  }
});

module.exports = router;
