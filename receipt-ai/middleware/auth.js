const { verifyToken } = require("../services/auth");
const User = require("../models/User");

// Authorization: Bearer <token> başlığını doğrular ve req.userId'yi set eder.
// Bundan sonraki route'lar (products/recipes/dashboard/consumption-log/
// upload) hep bu değeri kullanarak veriyi kullanıcıya göre filtreler.
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      message: "Yetkilendirme gerekli. Authorization: Bearer <token> başlığı eksik.",
    });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ message: "Geçersiz veya süresi dolmuş token." });
  }

  // JWT durumsuz olduğu için hesap silindikten sonra da (7 gün boyunca)
  // imzası geçerli kalır. Kullanıcının hâlâ var olduğunu doğrulamazsak, silinmiş
  // bir hesabın belirteciyle gelen istek (ör. ürün ekleme) sahipsiz kayıt
  // oluşturabilirdi.
  let userExists;
  try {
    userExists = await User.exists({ _id: payload.userId });
  } catch (error) {
    // Geçersiz bir userId (ör. ObjectId olmayan) belirteç sahtesi/bozuk
    // demektir; veritabanı erişim hatası ise bizim hatamızdır.
    if (error.name === "CastError") {
      return res.status(401).json({ message: "Geçersiz veya süresi dolmuş token." });
    }
    return res.status(500).json({ message: "Kimlik doğrulanırken bir hata oluştu." });
  }

  if (!userExists) {
    return res.status(401).json({ message: "Bu belirtece ait hesap bulunamadı." });
  }

  req.userId = payload.userId;
  next();
}

module.exports = { requireAuth };
