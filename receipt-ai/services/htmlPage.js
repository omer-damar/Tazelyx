const config = require("../config");

// E-posta linklerinden (onay/şifre sıfırlama hatası) açılan sayfalarda ham
// JSON yerine gösterilen, markaya uygun, kendi kendine yeten (harici CSS/JS
// gerektirmeyen) basit bir HTML sayfası. Kullanıcı bu sayfayı sadece görüp
// uygulamaya geri dönecek — form/interaktiflik gerekmiyor.
function renderBrandedPage(res, { statusCode = 200, heading, message, tone = "success" }) {
  const accentColor = tone === "success" ? "#047857" : "#b91c1c";

  res.status(statusCode).type("html").send(`<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${config.EMAIL_SENDER_NAME}</title>
</head>
<body style="margin:0;padding:0;background:linear-gradient(160deg,#d3f5ec,#eefaf5 60%,#ffffff);font-family:-apple-system,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="max-width:420px;width:90%;background:rgba(255,255,255,0.85);border-radius:24px;padding:36px 28px;text-align:center;box-shadow:0 8px 30px rgba(15,23,42,0.08);">
    <img src="/assets/tazelyx-logo.png" alt="${config.EMAIL_SENDER_NAME}" style="height:44px;margin-bottom:20px;" />
    <h1 style="font-size:20px;color:${accentColor};margin:0 0 12px;">${heading}</h1>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0;">${message}</p>
  </div>
</body>
</html>`);
}

module.exports = { renderBrandedPage };
