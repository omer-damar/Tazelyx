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

// Bağlantı mailde çıplak adres olarak DEĞİL, düğme olarak gösterilir (ekran
// görüntüsünde / paylaşımda token görünmesin). Token adresin "#token=" parçasında
// (fragment) taşınır: sunucuya, erişim kayıtlarına ve Referer'a hiç gitmez;
// açılan sayfa onu okuyup adres çubuğundan siler (bkz. services/htmlPage.js).
const BUTTON_STYLE =
  "display:inline-block;background:#047857;color:#ffffff;padding:13px 26px;border-radius:12px;text-decoration:none;font-weight:600;font-family:Arial,Helvetica,sans-serif;font-size:15px;";

function actionButton(url, label) {
  return `<p style="margin:22px 0;"><a href="${url}" style="${BUTTON_STYLE}">${label}</a></p>`;
}

async function sendVerificationEmail(toEmail, token) {
  const verifyUrl = `${config.APP_BASE_URL}/api/auth/verify-email#token=${token}`;

  await transporter.sendMail({
    from: `"${config.EMAIL_SENDER_NAME}" <${config.EMAIL_USER}>`,
    to: toEmail,
    subject: `${config.EMAIL_SENDER_NAME} - E-posta Adresini Onayla`,
    attachments: [LOGO_ATTACHMENT],
    html: `
      ${LOGO_HEADER_HTML}
      <p>Merhaba,</p>
      <p>${config.EMAIL_SENDER_NAME} hesabını aktifleştirmek için aşağıdaki düğmeye tıkla:</p>
      ${actionButton(verifyUrl, "E-postamı onayla")}
      <p>Bu bağlantı 24 saat geçerlidir. Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.</p>
    `,
  });
}

async function sendPasswordResetEmail(toEmail, token) {
  // Link "exp://" şemasına değil, backend'in http(s) uç noktasına işaret eder —
  // e-posta istemcileri (Outlook/Gmail/Mail) "exp://" gibi özel şemaları
  // linklemez. Açılan sayfa (GET /reset-password) tarayıcıda bir şifre formu
  // gösterir; telefonda uygulamayı tercih edenler için derin bağlantı da sunar.
  const resetUrl = `${config.APP_BASE_URL}/api/auth/reset-password#token=${token}`;

  await transporter.sendMail({
    from: `"${config.EMAIL_SENDER_NAME}" <${config.EMAIL_USER}>`,
    to: toEmail,
    subject: `${config.EMAIL_SENDER_NAME} - Şifre Sıfırlama`,
    attachments: [LOGO_ATTACHMENT],
    html: `
      ${LOGO_HEADER_HTML}
      <p>Merhaba,</p>
      <p>Şifreni sıfırlamak için aşağıdaki düğmeyi kullan:</p>
      ${actionButton(resetUrl, "Şifremi sıfırla")}
      <p>Bu bağlantı 1 saat geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
