const mongoose = require("mongoose");
const Product = require("../models/Product");
const { startOfToday } = require("./shelfLife");

// Bu sorgu, routes/products.js (usable-for-recipes uç noktası) ve
// routes/recipes.js tarafından ortak kullanılır — mantığın iki yerde ayrı
// ayrı yazılmasını önler.
async function getUsableForRecipeProducts(userId) {
  // Alt sınır olarak `now` DEĞİL `startOfToday()` kullanılır — aynı gerekçe
  // shelfLife.js'te ayrıntılı açıklanıyor: effectiveExpireDate, ürünün
  // kaydedildiği saati miras alıyor, bu yüzden "bugün bozulan" bir ürün o
  // saat geçer geçmez `now`'a göre "süresi geçmiş" sayılıp tarif önerisinden
  // sessizce düşerdi — tam da uygulamanın onu kullanmayı önermesi gereken anda.
  return Product.find({
    userId,
    effectiveExpireDate: { $ne: null, $gte: startOfToday() },
    quantity: { $gt: 0 },
  }).sort({ effectiveExpireDate: 1 });
}

// Aynı üründen birden fazla "parti" olabilir (ör. dünden kalan 0.6 kg süt +
// bugün alınan taze 1.5 kg süt) — bunlar bilerek TEK bir kayda birleştirilmiyor,
// çünkü her partinin kendi bozulma tarihi var ve birleştirmek bu bilgiyi
// kaybettirir (bkz. routes/upload.js, her fiş kalemi ayrı Product olarak
// kaydediliyor). Bu fonksiyon, alttaki kayıtlara dokunmadan sadece
// GÖRÜNTÜLEME amaçlı isme göre gruplanmış bir toplam üretiyor.
async function getProductSummaryByName(userId) {
  // NOT: Model.aggregate() (Model.find()'ın aksine) şemaya göre otomatik tip
  // dönüşümü yapmıyor — userId'yi elle ObjectId'ye çevirmezsek $match hiçbir
  // dokümanla eşleşmez (string "userId" !== ObjectId userId).
  const groups = await Product.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        quantity: { $gt: 0 },
      },
    },
    {
      $group: {
        _id: { name: "$name", unit: "$unit" },
        totalQuantity: { $sum: "$quantity" },
        batchCount: { $sum: 1 },
        nearestExpireDate: { $min: "$effectiveExpireDate" },
      },
    },
    { $sort: { "_id.name": 1 } },
  ]);

  const summary = {};

  for (const group of groups) {
    const { name, unit } = group._id;
    const entry = {
      totalQuantity: group.totalQuantity,
      unit,
      batchCount: group.batchCount,
      nearestExpireDate: group.nearestExpireDate,
    };

    if (summary[name] === undefined) {
      summary[name] = entry;
    } else {
      // Aynı ürün adı farklı birimlerle de kayıtlı olabilir (nadir bir
      // durum, ör. "domates" bir fişte kg, başka bir fişte adet olarak
      // okunmuş olabilir) — kg ile adet toplanamayacağı için tek bir sayıya
      // indirgemek yerine birim bazında ayrı bir liste hâline getiriyoruz.
      const existing = Array.isArray(summary[name]) ? summary[name] : [summary[name]];
      existing.push(entry);
      summary[name] = existing;
    }
  }

  return summary;
}

module.exports = { getUsableForRecipeProducts, getProductSummaryByName };
