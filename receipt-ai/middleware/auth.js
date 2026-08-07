const { verifyToken } = require("../services/auth");

// Authorization: Bearer <token> başlığını doğrular ve req.userId'yi set eder.
// Bundan sonraki route'lar (products/recipes/dashboard/consumption-log/
// upload) hep bu değeri kullanarak veriyi kullanıcıya göre filtreler.
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      message: "Yetkilendirme gerekli. Authorization: Bearer <token> başlığı eksik.",
    });
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ message: "Geçersiz veya süresi dolmuş token." });
  }
}

module.exports = { requireAuth };
