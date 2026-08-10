const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: "HS256",
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
}

// E-posta onayı ve şifre sıfırlama bağlantıları için: e-postada giden ham
// token ile veritabanında SAKLANAN hash farklı — şifrelerde olduğu gibi,
// veritabanı sızarsa bu token'ların doğrudan kullanılabilir olmaması için.
// Token zaten yüksek entropili rastgele bir değer olduğundan (bcrypt'in
// aksine) basit bir SHA-256 hash'i yeterli ve hızlı.
function generateUrlToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, hashedToken };
}

function hashUrlToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  generateUrlToken,
  hashUrlToken,
};
