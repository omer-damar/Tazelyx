const path = require("path");
const nodemailer = require("nodemailer");
const config = require("../config");

// Gmail SMTP kullanıyoruz: gerçek Gmail şifresi değil, Google hesabında
// 2 Adımlı Doğrulama açıkken üretilen bir "Uygulama Şifresi" ile çalışır.
// Ücretsiz, alan adı doğrulaması gerektirmez, gerçek e-posta adreslerine
// gönderim yapabilir — bir öğrenci projesi için en pratik seçenek.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_APP_PASSWORD,
  },
});

const LOGO_PATH = path.join(__dirname, "..", "assets", "tazelyx-logo.png");
const LOGO_CID = "tazelyxlogo";

// NOT: Gönderen hesabının Google profil fotoğrafı e-posta istemcilerinde
// GÖRÜNMEZ (ör. Outlook/Hotmail bunu hiç okumaz, kendi baş harf ikonunu
// gösterir) — bu, istemciye özgü bir davranış, bizim kontrolümüzde değil.
// Marka görselinin her istemcide tutarlı görünmesi için logoyu doğrudan
// e-postanın gövdesine gömülü bir resim (cid) olarak ekliyoruz.
const LOGO_ATTACHMENT = {
  filename: "tazelyx-logo.png",
  path: LOGO_PATH,
  cid: LOGO_CID,
};

const LOGO_HEADER_HTML = `<img src="cid:${LOGO_CID}" alt="${config.EMAIL_SENDER_NAME}" style="height:40px;margin-bottom:16px;" />`;

async function sendVerificationEmail(toEmail, token) {
  const verifyUrl = `${config.APP_BASE_URL}/api/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"${config.EMAIL_SENDER_NAME}" <${config.EMAIL_USER}>`,
    to: toEmail,
    subject: `${config.EMAIL_SENDER_NAME} - E-posta Adresini Onayla`,
    attachments: [LOGO_ATTACHMENT],
    html: `
      ${LOGO_HEADER_HTML}
      <p>Merhaba,</p>
      <p>${config.EMAIL_SENDER_NAME} hesabını aktifleştirmek için aşağıdaki bağlantıya tıkla:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>Bu bağlantı 24 saat geçerlidir.</p>
    `,
  });
}

async function sendPasswordResetEmail(toEmail, token) {
  // Link doğrudan "exp://" şemasına değil, backend'in http(s) uç noktasına
  // işaret eder — e-posta istemcileri (Outlook/Gmail/Mail) "exp://" gibi
  // özel şemaları linklemez, sadece düz metin gösterir. Backend'deki GET
  // /reset-password (routes/auth.js) bu isteği alıp asıl hedefe (Expo
  // Go'daki reset-password ekranı) 302 ile yönlendirir.
  const resetUrl = `${config.APP_BASE_URL}/api/auth/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"${config.EMAIL_SENDER_NAME}" <${config.EMAIL_USER}>`,
    to: toEmail,
    subject: `${config.EMAIL_SENDER_NAME} - Şifre Sıfırlama`,
    attachments: [LOGO_ATTACHMENT],
    html: `
      ${LOGO_HEADER_HTML}
      <p>Merhaba,</p>
      <p>Şifreni sıfırlamak için aşağıdaki bağlantıyı kullan:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Bu bağlantı 1 saat geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
