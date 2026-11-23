// Gerçek bir Express app + gerçek bir (bellek içi) MongoDB üzerinden uçtan
// uca çalışan tek integration test paketi — bkz. AUDIT_BACKEND.md, "Should
// fix #13". Amaç: auth akışının gerçekten çalıştığını VE (asıl önemlisi)
// hiçbir kullanıcının başka bir kullanıcının verisini okuyamadığını/
// değiştiremediğini/silemediğini kanıtlamak. Diğer test dosyaları saf mantığı
// (algoritmalar, ayrıştırıcılar) izole test ediyor; bu dosya route + middleware
// + Mongoose'un BİRLİKTE doğru çalıştığını doğruluyor.
process.env.JWT_SECRET = "integration-test-only-secret-value-not-real-1234567890";
// services/receiptAi.js, recipeAi.js ve shelfLifeAi.js hepsi AI istemcisini
// MODÜL YÜKLENİRKEN kuruyor (bkz. AUDIT_BACKEND.md, Quality #Q1) — app.js'i
// require etmek bu üçünü de zincirleme require ediyor, bu yüzden gerçek bir
// anahtar olmadan bile bir tane tanımlı olmalı ki sadece kurulum aşamasında
// patlamasın. Hiçbir testte gerçek bir AI çağrısı yapılmıyor.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "integration-test-dummy-key";

// Gerçek bir e-posta gönderilmesin diye (nodemailer, EMAIL_USER/APP_PASSWORD
// yapılandırılmadan çağrılırsa zaten hata verir) e-posta servisini mock'luyoruz
// — asıl test edilen şey e-posta gönderimi değil, route/yetki mantığı.
jest.mock("../../services/email", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../../app");
const User = require("../../models/User");
const Product = require("../../models/Product");
const ShoppingList = require("../../models/ShoppingList");
const ConsumptionLog = require("../../models/ConsumptionLog");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

async function registerVerifiedAndLogin(email, password = "password123") {
  await request(app)
    .post("/api/auth/register")
    .send({ email, password, name: "Test" })
    .expect(201);

  // Gerçek akışta bu, e-postadaki linke tıklanınca olur — testte doğrudan
  // veritabanında işaretliyoruz, e-posta gönderimini/tıklamasını simüle
  // etmenin bir değeri yok, asıl test edilen ownership sınırı.
  await User.updateOne({ email }, { emailVerified: true });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password })
    .expect(200);

  return { token: loginRes.body.token, userId: loginRes.body.user.id };
}

describe("auth flow (register -> verify -> login)", () => {
  it("rejects login before email verification, then succeeds after", async () => {
    const email = "unverified@test.com";
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", name: "Kullanıcı" })
      .expect(201);

    const beforeVerify = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    expect(beforeVerify.status).toBe(403);

    await User.updateOne({ email }, { emailVerified: true });

    const afterVerify = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "password123" });
    expect(afterVerify.status).toBe(200);
    expect(afterVerify.body.token).toEqual(expect.any(String));
  });

  it("rolls the account back when the verification mail cannot be sent", async () => {
    const { sendVerificationEmail } = require("../../services/email");
    const email = "smtp-down@test.com";
    sendVerificationEmail.mockRejectedValueOnce(new Error("SMTP unreachable"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const failed = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", name: "Kullanıcı" });
    expect(failed.status).toBe(503);
    expect(await User.countDocuments({ email })).toBe(0);

    // SMTP düzelince aynı e-postayla kayıt olabilmeli (409 almamalı).
    const retry = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", name: "Kullanıcı" });
    expect(retry.status).toBe(201);
    expect(await User.countDocuments({ email })).toBe(1);

    errorSpy.mockRestore();
  });

  it("rejects a still-unexpired token once its account has been deleted", async () => {
    const { token, userId } = await registerVerifiedAndLogin("deleted@test.com");

    await request(app)
      .delete("/api/auth/account")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    // Belirtecin imzası ve süresi hâlâ geçerli — ama sahibi artık yok.
    const list = await request(app).get("/api/products").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(401);

    const create = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Süt", quantity: 1, unit: "lt" });
    expect(create.status).toBe(401);
    // Sahipsiz (orphan) kayıt oluşmamış olmalı.
    expect(await Product.countDocuments({ userId })).toBe(0);
  });

  it("rejects a validly signed token whose userId is not an ObjectId", async () => {
    const { signToken } = require("../../services/auth");
    const res = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${signToken("not-an-object-id")}`);
    expect(res.status).toBe(401);
  });

  it("rejects a request to a protected route with no token", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(401);
  });

  it("rejects a request with a malformed/garbage token", async () => {
    const res = await request(app)
      .get("/api/products")
      .set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
  });
});

describe("ownership boundary: user A cannot read, modify, or delete user B's data", () => {
  it("hides user A's products from user B's product list", async () => {
    const userA = await registerVerifiedAndLogin("a1@test.com");
    const userB = await registerVerifiedAndLogin("b1@test.com");

    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Süt", quantity: 1, unit: "lt" })
      .expect(201);

    const listB = await request(app)
      .get("/api/products")
      .set("Authorization", `Bearer ${userB.token}`)
      .expect(200);

    expect(listB.body.products).toHaveLength(0);
  });

  it("returns 404 (not another user's data) when fetching by id across accounts", async () => {
    const userA = await registerVerifiedAndLogin("a2@test.com");
    const userB = await registerVerifiedAndLogin("b2@test.com");

    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Yumurta", quantity: 6, unit: "adet" })
      .expect(201);
    const productId = createRes.body.product._id;

    const getAsB = await request(app)
      .get(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${userB.token}`);
    expect(getAsB.status).toBe(404);

    const getAsA = await request(app)
      .get(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${userA.token}`);
    expect(getAsA.status).toBe(200);
  });

  it("does not let user B update user A's product", async () => {
    const userA = await registerVerifiedAndLogin("a3@test.com");
    const userB = await registerVerifiedAndLogin("b3@test.com");

    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Peynir", quantity: 1, unit: "kg" })
      .expect(201);
    const productId = createRes.body.product._id;

    const patchAsB = await request(app)
      .patch(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${userB.token}`)
      .send({ quantity: 99 });
    expect(patchAsB.status).toBe(404);

    const stillOriginal = await Product.findById(productId);
    expect(stillOriginal.quantity).toBe(1);
  });

  it("does not let user B delete user A's product", async () => {
    const userA = await registerVerifiedAndLogin("a4@test.com");
    const userB = await registerVerifiedAndLogin("b4@test.com");

    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Tavuk", quantity: 1, unit: "kg" })
      .expect(201);
    const productId = createRes.body.product._id;

    const deleteAsB = await request(app)
      .delete(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${userB.token}`);
    expect(deleteAsB.status).toBe(404);

    const stillThere = await Product.findById(productId);
    expect(stillThere).not.toBeNull();
  });

  it("hides user A's shopping list from user B", async () => {
    const userA = await registerVerifiedAndLogin("a5@test.com");
    const userB = await registerVerifiedAndLogin("b5@test.com");

    await request(app)
      .post("/api/shopping-list")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Ekmek" })
      .expect(201);

    const listB = await request(app)
      .get("/api/shopping-list")
      .set("Authorization", `Bearer ${userB.token}`)
      .expect(200);

    expect(listB.body.items).toHaveLength(0);
  });

  it("account deletion removes only the deleting user's own data, not other users'", async () => {
    const userA = await registerVerifiedAndLogin("a6@test.com");
    const userB = await registerVerifiedAndLogin("b6@test.com");

    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${userA.token}`)
      .send({ name: "Muz", quantity: 1, unit: "kg" })
      .expect(201);
    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${userB.token}`)
      .send({ name: "Elma", quantity: 1, unit: "kg" })
      .expect(201);
    await request(app)
      .post("/api/shopping-list")
      .set("Authorization", `Bearer ${userB.token}`)
      .send({ name: "Süt" })
      .expect(201);

    await request(app)
      .delete("/api/auth/account")
      .set("Authorization", `Bearer ${userA.token}`)
      .expect(200);

    const remainingProducts = await Product.find({});
    expect(remainingProducts).toHaveLength(1);
    expect(remainingProducts[0].name).toBe("elma");

    const remainingUsers = await User.find({});
    expect(remainingUsers).toHaveLength(1);
    expect(remainingUsers[0].email).toBe("b6@test.com");

    // Regresyon testi: C1 (bkz. AUDIT_BACKEND.md) — hesap silme daha önce
    // ShoppingList'i unutuyordu. Burada B'nin (silinmeyen kullanıcı) listesi
    // dokunulmamış kalmalı; A'nın (silinen kullanıcı) zaten hiç listesi yoktu.
    const remainingListItems = await ShoppingList.find({});
    expect(remainingListItems).toHaveLength(1);
    expect(remainingListItems[0].userId.toString()).toBe(userB.userId);
  });
});

describe("indexes: every per-user collection is indexed by userId", () => {
  // Her sorgu userId ile başladığı için indeksin ilk alanı userId olmalı
  // (bkz. rapor Bölüm 4.1.3 — indeks eksikliği daha önce açık bir bulguydu).
  it.each([
    ["Product", Product],
    ["ConsumptionLog", ConsumptionLog],
    ["ShoppingList", ShoppingList],
  ])("%s has an index whose first key is userId", async (_name, Model) => {
    await Model.init(); // indeks oluşturma tamamlanana kadar bekle
    const indexes = await Model.collection.indexes();
    const leadsWithUserId = indexes.some((index) => Object.keys(index.key)[0] === "userId");
    expect(leadsWithUserId).toBe(true);
  });
});

describe("password reset: browser form and flow", () => {
  const { generateUrlToken } = require("../../services/auth");

  async function userWithResetToken(email, password = "oldpassword1") {
    await request(app)
      .post("/api/auth/register")
      .send({ email, password, name: "Reset" })
      .expect(201);
    const { rawToken, hashedToken } = generateUrlToken();
    await User.updateOne(
      { email },
      {
        emailVerified: true,
        passwordResetToken: hashedToken,
        passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000),
      }
    );
    return rawToken;
  }

  it("serves the reset form as a static page that reads the token from the URL fragment", async () => {
    const res = await request(app).get("/api/auth/reset-password").redirects(0);

    expect(res.status).toBe(200); // yönlendirme yok
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.text).toContain('id="f"'); // form
    expect(res.text).toContain("location.hash"); // token fragment'tan okunuyor
    expect(res.text).toContain("history.replaceState"); // ve adres çubuğundan siliniyor
    expect(res.text).toContain("exp://"); // uygulamada aç bağlantısı da duruyor
  });

  it("never echoes a token from the query string into the page", async () => {
    const evil = "\"><script>alert(1)</script>";
    const res = await request(app).get("/api/auth/reset-password").query({ token: evil });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("alert(1)");

    const { rawToken } = generateUrlToken();
    const legit = await request(app).get("/api/auth/reset-password").query({ token: rawToken });
    expect(legit.text).not.toContain(rawToken); // sunucu token'ı sayfaya basmaz
  });

  it("changes the password with a valid token, and the token works only once", async () => {
    const email = "resetflow@test.com";
    const rawToken = await userWithResetToken(email);

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, newPassword: "brandnewpass1" })
      .expect(200);

    await request(app).post("/api/auth/login").send({ email, password: "oldpassword1" }).expect(401);
    await request(app).post("/api/auth/login").send({ email, password: "brandnewpass1" }).expect(200);

    const reuse = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, newPassword: "anotherpass12" });
    expect(reuse.status).toBe(400);
  });
});

describe("email verification: button page and POST", () => {
  const { generateUrlToken } = require("../../services/auth");

  async function unverifiedUserWithToken(email, expiresInMs = 24 * 60 * 60 * 1000) {
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", name: "Verify" })
      .expect(201);
    const { rawToken, hashedToken } = generateUrlToken();
    await User.updateOne(
      { email },
      { emailVerificationToken: hashedToken, emailVerificationExpires: new Date(Date.now() + expiresInMs) }
    );
    return rawToken;
  }

  it("opening the link does NOT verify the account; it only shows a confirm page", async () => {
    const email = "verify-scan@test.com";
    const rawToken = await unverifiedUserWithToken(email);

    // Bir e-posta güvenlik tarayıcısının bağlantıyı (eski ?token= biçimiyle de) önceden açması:
    const res = await request(app).get("/api/auth/verify-email").query({ token: rawToken });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.text).toContain("E-postamı onayla");
    expect(res.text).not.toContain(rawToken);

    const user = await User.findOne({ email });
    expect(user.emailVerified).toBe(false);
  });

  it("POST with a valid token verifies the account, once", async () => {
    const email = "verify-ok@test.com";
    const rawToken = await unverifiedUserWithToken(email);

    await request(app).post("/api/auth/login").send({ email, password: "password123" }).expect(403);

    await request(app).post("/api/auth/verify-email").send({ token: rawToken }).expect(200);

    await request(app).post("/api/auth/login").send({ email, password: "password123" }).expect(200);

    const reuse = await request(app).post("/api/auth/verify-email").send({ token: rawToken });
    expect(reuse.status).toBe(400);
  });

  it("rejects an invalid, missing or expired token", async () => {
    const expiredToken = await unverifiedUserWithToken("verify-expired@test.com", -1000);

    const bad = await request(app).post("/api/auth/verify-email").send({ token: "0".repeat(64) });
    expect(bad.status).toBe(400);
    const missing = await request(app).post("/api/auth/verify-email").send({});
    expect(missing.status).toBe(400);
    const expired = await request(app).post("/api/auth/verify-email").send({ token: expiredToken });
    expect(expired.status).toBe(400);
    expect((await User.findOne({ email: "verify-expired@test.com" })).emailVerified).toBe(false);
  });
});
