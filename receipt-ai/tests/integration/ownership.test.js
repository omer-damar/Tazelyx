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
