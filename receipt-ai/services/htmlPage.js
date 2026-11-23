const config = require("../config");

// E-posta bağlantılarının (şifre sıfırlama, e-posta onayı) açtığı, markaya uygun,
// kendi kendine yeten (harici CSS/JS gerektirmeyen) HTML sayfaları.
//
// ---- Token'lı e-posta bağlantılarının açtığı, TARAYICIDA çalışan sayfalar ----
// Bağlantıdaki token artık adresin "?token=" kısmında değil, "#token=" parçasında
// (fragment) taşınıyor: fragment sunucuya hiç gönderilmez, erişim kayıtlarına ve
// Referer başlığına girmez. Sayfanın kendi JavaScript'i token'ı okuyup adres
// çubuğundan SİLER (history.replaceState), sonra yalnızca POST gövdesinde
// gönderir. Eski mailler "?token=" ile gelmiş olabilir; onlar da okunur.
// Sunucu token'ı sayfaya HİÇ basmaz, yani sayfada token yansıtma (XSS) yüzeyi yok.
function sendTokenPage(res, html) {
  // Token adreste taşındığı için sayfa önbelleğe alınmasın, başka sitelere sızmasın.
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  res.status(200).type("html").send(html);
}

const TOKEN_PAGE_STYLE = `
  *{box-sizing:border-box}
  body{margin:0;background:linear-gradient(160deg,#d3f5ec,#eefaf5 60%,#ffffff);font-family:-apple-system,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;color:#0f172a}
  .card{max-width:420px;width:92%;background:rgba(255,255,255,0.9);border-radius:24px;padding:32px 26px;box-shadow:0 8px 30px rgba(15,23,42,0.08);text-align:center}
  img{height:44px;margin-bottom:16px}
  h1{font-size:20px;margin:0 0 6px;color:#047857}
  h1.bad{color:#b91c1c}
  p.lead{font-size:14px;color:#475569;margin:0 0 18px;line-height:1.5}
  input{width:100%;height:50px;border:1px solid #cbd5e1;border-radius:12px;padding:0 14px;font-size:16px;margin-bottom:10px;background:#fff}
  input:focus{outline:2px solid #047857;border-color:#047857}
  button{width:100%;height:50px;border:0;border-radius:12px;background:#047857;color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-top:4px}
  button:disabled{opacity:.6;cursor:default}
  #msg{min-height:20px;font-size:14px;margin:6px 0 2px}
  .err{color:#b91c1c}.ok{color:#047857}
  a.app{display:inline-block;margin-top:18px;font-size:13px;color:#475569}
`;

// Her iki sayfada ortak: token'ı fragment'tan (ya da eski ?token='dan) oku ve adresten sil.
const TOKEN_READER_JS = `
  var m = /(?:^#|&)token=([a-f0-9]{64})/i.exec(location.hash) || /[?&]token=([a-f0-9]{64})/i.exec(location.search);
  var TOKEN = m ? m[1] : null;
  if (location.hash || location.search) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
`;

function tokenPageShell({ title, heading, lead, innerHtml, script }) {
  const name = config.EMAIL_SENDER_NAME;
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>${name} – ${title}</title>
<style>${TOKEN_PAGE_STYLE}</style>
</head>
<body>
  <div class="card">
    <img src="/assets/tazelyx-logo.png" alt="${name}" />
    <h1 id="h">${heading}</h1>
    <p class="lead" id="lead">${lead}</p>
    ${innerHtml}
    <div id="msg" role="status" aria-live="polite"></div>
  </div>
<script>
(function () {
${TOKEN_READER_JS}
  var msg = document.getElementById('msg');
  function show(text, cls) { msg.textContent = text; msg.className = cls; }
  function badLink(text) {
    var h = document.getElementById('h'); h.textContent = 'Geçersiz bağlantı'; h.className = 'bad';
    document.getElementById('lead').textContent = text;
    var form = document.getElementById('f'); if (form) form.style.display = 'none';
    var app = document.getElementById('app'); if (app) app.style.display = 'none';
  }
${script}
})();
</script>
</body>
</html>`;
}

// Şifre sıfırlama formu. Telefonda uygulamayı tercih edenler için "uygulamada aç"
// derin bağlantısı (exp://) da duruyor; token'ı sayfanın JS'i bağlantıya ekler.
function renderResetPasswordPage(res) {
  const html = tokenPageShell({
    title: "Yeni şifre",
    heading: "Yeni şifreni belirle",
    lead: "En az 8 karakterlik yeni şifreni iki kez gir.",
    innerHtml: `
    <form id="f" novalidate>
      <input id="p1" type="password" autocomplete="new-password" placeholder="Yeni şifre (en az 8 karakter)" required />
      <input id="p2" type="password" autocomplete="new-password" placeholder="Yeni şifre (tekrar)" required />
      <button id="btn" type="submit">Şifreyi Güncelle</button>
    </form>
    <a class="app" id="app" href="#" style="display:none">Bunun yerine telefondaki uygulamada aç</a>`,
    script: `
  var EXPO_URL = ${JSON.stringify(config.EXPO_APP_URL)};
  var f = document.getElementById('f'), p1 = document.getElementById('p1'), p2 = document.getElementById('p2'), btn = document.getElementById('btn');
  if (!TOKEN) {
    badLink('Bu şifre sıfırlama bağlantısı eksik veya bozuk görünüyor. Mailin içindeki düğmeyi yeniden dene ya da uygulamadan yeni bir bağlantı iste.');
  } else {
    var app = document.getElementById('app');
    app.href = EXPO_URL + '/--/reset-password?token=' + TOKEN; app.style.display = 'inline-block';
  }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!TOKEN) return;
    if (p1.value.length < 8) return show('Şifre en az 8 karakter olmalı.', 'err');
    if (p1.value !== p2.value) return show('Şifreler eşleşmiyor.', 'err');
    btn.disabled = true; btn.textContent = 'Kaydediliyor…'; show('', '');
    fetch('/api/auth/reset-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, newPassword: p1.value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      if (res.ok) {
        f.style.display = 'none'; document.getElementById('app').style.display = 'none';
        document.getElementById('lead').textContent = 'Şimdi uygulamaya dönüp yeni şifrenle giriş yapabilirsin.';
        show(res.d.message || 'Şifren güncellendi.', 'ok');
      } else {
        btn.disabled = false; btn.textContent = 'Şifreyi Güncelle'; show(res.d.message || 'Bir hata oluştu.', 'err');
      }
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Şifreyi Güncelle';
      show('Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.', 'err');
    });
  });`,
  });
  sendTokenPage(res, html);
}

// E-posta doğrulama sayfası: doğrulama artık bağlantıya tıklar tıklamaz DEĞİL,
// sayfadaki düğmeye basılınca (POST /api/auth/verify-email) yapılıyor; böylece
// e-posta güvenlik tarayıcılarının bağlantıyı önceden açması hesabı onaylamıyor.
function renderVerifyEmailPage(res) {
  const html = tokenPageShell({
    title: "E-posta onayı",
    heading: "E-postanı onayla",
    lead: "Hesabını etkinleştirmek için aşağıdaki düğmeye bas.",
    innerHtml: `
    <form id="f" novalidate>
      <button id="btn" type="submit">E-postamı onayla</button>
    </form>`,
    script: `
  var f = document.getElementById('f'), btn = document.getElementById('btn');
  if (!TOKEN) {
    badLink('Bu onay bağlantısı eksik veya bozuk görünüyor. Mailin içindeki düğmeyi yeniden dene ya da uygulamadan yeni bir onay e-postası iste.');
  }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!TOKEN) return;
    btn.disabled = true; btn.textContent = 'Onaylanıyor…'; show('', '');
    fetch('/api/auth/verify-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      if (res.ok) {
        f.style.display = 'none';
        document.getElementById('h').textContent = 'E-postan onaylandı!';
        document.getElementById('lead').textContent = 'Şimdi uygulamaya dönüp giriş yapabilirsin.';
        show('', '');
      } else {
        btn.disabled = false; btn.textContent = 'E-postamı onayla'; show(res.d.message || 'Bir hata oluştu.', 'err');
      }
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'E-postamı onayla';
      show('Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.', 'err');
    });
  });`,
  });
  sendTokenPage(res, html);
}

module.exports = { renderResetPasswordPage, renderVerifyEmailPage };
