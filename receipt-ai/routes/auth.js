const express = require("express");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const Product = require("../models/Product");
const ConsumptionLog = require("../models/ConsumptionLog");
const UploadedReceipt = require("../models/UploadedReceipt");
const ShoppingList = require("../models/ShoppingList");
const {
  hashPassword,
  comparePassword,
  signToken,
  generateUrlToken,
  hashUrlToken,
} = require("../services/auth");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/email");
const { renderResetPasswordPage, renderVerifyEmailPage } = require("../services/htmlPage");
const { requireAuth } = require("../middleware/auth");
const { safeErrorDetail } = require("../utils/errorResponse");
const config = require("../config");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Kimliksiz istemcilerin sınırsız deneme yapabildiği uç noktalar için ortak
// sınırlayıcı: kaba kuvvet (login) ve e-posta gönderim kotasını tüketme
// (forgot-password/resend-verification, ikisi de her istekte gerçek bir
// e-posta gönderiyor) saldırılarına karşı. IP başına 15 dakikada 10 istek —
// meşru bir kullanıcının birkaç yanlış denemesini engellemeyecek kadar
// gevşek, otomatikleştirilmiş bir denemeyi engelleyecek kadar sıkı.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  // Test ortamında (integration testleri tek bir process'ten, tek bir
  // "IP"den onlarca register/login isteği atıyor) sınırlayıcı tamamen
  // atlanıyor — gerçek çalışma zamanında (NODE_ENV=test DEĞİLKEN) etkisiz.
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar dene." },
});

router.post("/register", authRateLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email ve password alanları gerekli." });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: "Geçersiz e-posta formatı." });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Şifre en az 8 karakter olmalı." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({ message: "Bu e-posta ile zaten bir hesap var." });
    }

    const passwordHash = await hashPassword(password);
    const { rawToken, hashedToken } = generateUrlToken();

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: name || "",
      emailVerificationToken: hashedToken,
      emailVerificationExpires: new Date(Date.now() + config.EMAIL_TOKEN_EXPIRES_MS),
    });

    try {
      await sendVerificationEmail(user.email, rawToken);
    } catch (mailError) {
      // Mail gitmediyse kullanıcı onay bağlantısını hiç alamaz; hesabı olduğu
      // gibi bırakırsak hem giriş yapamaz hem de aynı e-postayla tekrar kayıt
      // olamaz (409). Bu yüzden az önce açtığımız hesabı geri alıyoruz ki
      // kullanıcı SMTP düzelince baştan deneyebilsin.
      await User.deleteOne({ _id: user._id });
      console.error("Onay e-postası gönderilemedi, kayıt geri alındı:", safeErrorDetail(mailError));
      return res.status(503).json({
        message:
          "Onay e-postası şu an gönderilemedi, hesap oluşturulmadı. Lütfen biraz sonra tekrar dene.",
      });
    }

    // ÖNEMLİ: Giriş e-posta onaylanmadan yapılamadığı için burada JWT
    // dönmüyoruz — dönsek bile kullanıcı login'e kadar hiçbir işe
    // yaramayacaktı, kafa karıştırmamak için hiç vermiyoruz.
    res.status(201).json({
      message: "Hesap oluşturuldu. Devam etmek için e-postana gelen onay bağlantısına tıkla.",
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (error) {
    res.status(500).json({
      message: "Kayıt sırasında hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

// E-postadaki onay bağlantısı bu sayfayı açar; doğrulamanın kendisi sayfadaki
// düğmeyle (POST /verify-email) yapılır — e-posta güvenlik tarayıcılarının
// bağlantıyı önceden açması hesabı onaylamasın, token da sunucu kayıtlarında
// ve adres çubuğunda görünmesin diye (bkz. services/htmlPage.js).
router.get("/verify-email", (req, res) => {
  renderVerifyEmailPage(res);
});

router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;

    if (typeof token !== "string" || !token) {
      return res.status(400).json({ message: "token alanı gerekli." });
    }

    const hashedToken = hashUrlToken(token);
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        message:
          "Onay bağlantısı geçersiz veya süresi dolmuş. Uygulamadan tekrar onay e-postası isteyebilirsin.",
      });
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    res.json({ message: "E-postan onaylandı! Artık uygulamaya giriş yapabilirsin." });
  } catch (error) {
    res.status(500).json({
      message: "E-posta onayı sırasında hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

router.post("/resend-verification", authRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "email alanı gerekli." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Burada da hesabın var olup olmadığını sızdırmıyoruz; zaten onaylıysa
    // da aynı belirsiz mesajı dönüp sessizce hiçbir şey yapmıyoruz.
    if (user && !user.emailVerified) {
      const { rawToken, hashedToken } = generateUrlToken();
      user.emailVerificationToken = hashedToken;
      user.emailVerificationExpires = new Date(Date.now() + config.EMAIL_TOKEN_EXPIRES_MS);
      await user.save();
      await sendVerificationEmail(user.email, rawToken);
    }

    res.json({
      message: "Bu e-posta kayıtlı ve onaylanmamışsa, yeni bir onay bağlantısı gönderildi.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Onay e-postası gönderilirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

router.post("/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email ve password alanları gerekli." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Hesap bulunamadığında ve şifre yanlış olduğunda ayrı, net mesajlar
    // dönülüyor (tek bir belirsiz mesaj yerine), böylece silinmiş/hiç var
    // olmamış bir hesapla giriş denendiğinde kullanıcı "şifrem mi yanlış"
    // diye kafa karıştırmıyor. Bu, küçük ölçekli bu proje için kabul edilen
    // bir güvenlik ödünü — e-posta enumeration riskine karşı büyük ölçekli
    // bir üründe belirsiz mesaj tercih edilmeli.
    if (!user) {
      return res.status(404).json({ message: "Bu e-posta ile kayıtlı bir hesap yok." });
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Şifre hatalı." });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Giriş yapmadan önce e-posta adresini onaylaman gerekiyor.",
      });
    }

    const token = signToken(user._id.toString());

    res.json({
      message: "Giriş başarılı.",
      token,
      user: { id: user._id, email: user.email, name: user.name },
    });
  } catch (error) {
    res.status(500).json({
      message: "Giriş sırasında hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

router.post("/forgot-password", authRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "email alanı gerekli." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Bu e-posta kayıtlı değilse bile AYNI mesajı dönüyoruz — aksi hâlde bu
    // uç nokta "hangi e-postalar kayıtlı" diye taranabilir bir araca dönüşür.
    if (user) {
      const { rawToken, hashedToken } = generateUrlToken();
      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(
        Date.now() + config.PASSWORD_RESET_TOKEN_EXPIRES_MS
      );
      await user.save();
      await sendPasswordResetEmail(user.email, rawToken);
    }

    res.json({
      message: "Bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Şifre sıfırlama isteği sırasında hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

// E-postadaki şifre sıfırlama bağlantısı bu sayfayı açar: TARAYICIDA çalışan bir
// şifre formu (bilgisayarda da telefonda da, Expo Go olmadan); uygulamada açmak
// isteyenler için aynı sayfada derin bağlantı da var. Token "#token=" ile
// taşındığından sunucuya hiç ulaşmaz — bu yüzden burada token'a BAKMIYORUZ ve
// sayfaya hiçbir şey yansıtmıyoruz; sayfanın JS'i token'ı okuyup POST
// /reset-password'e gönderir, asıl doğrulama orada yapılır.
router.get("/reset-password", (req, res) => {
  renderResetPasswordPage(res);
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "token ve newPassword alanları gerekli." });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Şifre en az 8 karakter olmalı." });
    }

    const hashedToken = hashUrlToken(token);
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Sıfırlama bağlantısı geçersiz veya süresi dolmuş.",
      });
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    res.json({ message: "Şifren güncellendi, yeni şifrenle giriş yapabilirsin." });
  } catch (error) {
    res.status(500).json({
      message: "Şifre sıfırlama sırasında hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

// Hesap silme, /api/auth'un geri kalanının aksine (herkese açık — kayıt/
// giriş henüz token gerektirmiyor) requireAuth GEREKTİRİYOR — kendi
// hesabından başkasını silememesi için req.userId'nin geçerli bir token'dan
// gelmesi şart. Kullanıcının TÜM verisi (ürünler, tüketim logları, fiş
// tekrar-tespit kayıtları) hesapla BİRLİKTE kalıcı olarak siliniyor —
// "yetim" (sahipsiz userId'li) kayıt bırakmıyoruz.
router.delete("/account", requireAuth, async (req, res) => {
  try {
    const { userId } = req;

    await Promise.all([
      Product.deleteMany({ userId }),
      ConsumptionLog.deleteMany({ userId }),
      UploadedReceipt.deleteMany({ userId }),
      ShoppingList.deleteMany({ userId }),
    ]);

    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: "Hesap bulunamadı." });
    }

    res.json({ message: "Hesabın ve tüm verilerin kalıcı olarak silindi." });
  } catch (error) {
    res.status(500).json({
      message: "Hesap silinirken hata oluştu.",
      error: safeErrorDetail(error),
    });
  }
});

module.exports = router;
