const express = require("express");
const mongoose = require("mongoose");
const ShoppingList = require("../models/ShoppingList");
const { safeErrorDetail } = require("../utils/errorResponse");

const router = express.Router();

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Tüm listeyi getir — işaretlenmemişler önce, sonra işaretlenmişler (her
// grubun kendi içinde en yeni eklenen üstte).
router.get("/", async (req, res) => {
  try {
    const items = await ShoppingList.find({ userId: req.userId }).sort({
      isChecked: 1,
      createdAt: -1,
    });

    res.json({
      message: "Alışveriş listesi getirildi.",
      count: items.length,
      items,
    });
  } catch (error) {
    res.status(500).json({
      message: "Alışveriş listesi getirilirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, quantity, unit, source } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "name alanı gerekli." });
    }

    const trimmedName = name.trim();

    // Aynı ürün zaten işaretlenmemiş (henüz alınmamış) olarak listedeyse
    // ikinci bir kopya OLUŞTURMA — ör. "Tükenmek Üzere"den birkaç kez üst
    // üste "Ekle"ye basılırsa (ya da aynı ürün hem tahminle hem elle
    // eklenirse) liste aynı isimle dolup taşmasın.
    const existingItem = await ShoppingList.findOne({
      userId: req.userId,
      isChecked: false,
      name: { $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });

    if (existingItem) {
      return res.status(200).json({
        message: "Bu ürün zaten alışveriş listende.",
        item: existingItem,
      });
    }

    const item = await ShoppingList.create({
      userId: req.userId,
      name: trimmedName,
      quantity: typeof quantity === "number" ? quantity : null,
      unit: unit || null,
      source: source === "prediction" ? "prediction" : "manual",
    });

    res.status(201).json({
      message: "Ürün alışveriş listesine eklendi.",
      item,
    });
  } catch (error) {
    res.status(500).json({
      message: "Ürün eklenirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

// İşaretle/işareti kaldır veya ismi/miktarı düzenle
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Geçersiz kalem ID formatı." });
    }

    const { name, quantity, unit, isChecked } = req.body;
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (unit !== undefined) updateData.unit = unit;
    if (isChecked !== undefined) updateData.isChecked = isChecked;

    const updatedItem = await ShoppingList.findOneAndUpdate(
      { _id: id, userId: req.userId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ message: "Kalem bulunamadı." });
    }

    res.json({
      message: "Kalem güncellendi.",
      item: updatedItem,
    });
  } catch (error) {
    res.status(500).json({
      message: "Kalem güncellenirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Geçersiz kalem ID formatı." });
    }

    const deletedItem = await ShoppingList.findOneAndDelete({ _id: id, userId: req.userId });

    if (!deletedItem) {
      return res.status(404).json({ message: "Kalem bulunamadı." });
    }

    res.json({
      message: "Kalem listeden kaldırıldı.",
      item: deletedItem,
    });
  } catch (error) {
    res.status(500).json({
      message: "Kalem silinirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

module.exports = router;
