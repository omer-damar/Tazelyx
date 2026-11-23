// Doğrulama ve şifre sıfırlama maillerinin biçimi: bağlantı çıplak adres olarak
// değil düğme olarak görünmeli ve token adresin "#token=" parçasında taşınmalı
// (sunucuya/erişim kayıtlarına/Referer'a gitmez).
const mockSendMail = jest.fn().mockResolvedValue(undefined);

jest.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: mockSendMail }),
}));

const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/email");

const TOKEN = "a".repeat(64);

beforeEach(() => {
  mockSendMail.mockClear();
});

describe.each([
  ["verification", sendVerificationEmail, "/api/auth/verify-email", "E-postamı onayla"],
  ["password reset", sendPasswordResetEmail, "/api/auth/reset-password", "Şifremi sıfırla"],
])("%s email", (_name, send, path, buttonLabel) => {
  it("carries the token in the URL fragment, not the query string", async () => {
    await send("user@test.com", TOKEN);
    const { html } = mockSendMail.mock.calls[0][0];

    expect(html).toContain(`${path}#token=${TOKEN}`);
    expect(html).not.toContain(`?token=${TOKEN}`);
  });

  it("shows a button, not the raw link as visible text", async () => {
    await send("user@test.com", TOKEN);
    const { html } = mockSendMail.mock.calls[0][0];

    expect(html).toContain(`>${buttonLabel}</a>`);
    // Bağlantı yalnızca href içinde geçmeli; görünen metin olarak (>...</a>) çıplak adres olmamalı.
    expect(html).not.toMatch(/>\s*https?:\/\/[^<]*<\/a>/);
    expect(html.split(TOKEN).length - 1).toBe(1); // token mailde yalnızca bir kez (href'te)
  });
});
