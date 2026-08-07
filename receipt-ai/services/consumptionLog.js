const ConsumptionLog = require("../models/ConsumptionLog");
const User = require("../models/User");

// Ürün tamamen silindiğinde veya miktarı azaltıldığında çağrılır. Negatif/sıfır
// bir miktar (ör. miktar arttırıldıysa) loglanmaz — burası sadece azalışı,
// yani gerçek tüketimi kaydediyor.
async function logConsumption({ userId, productName, quantity, unit, reason, wasRescue = false }) {
  if (!quantity || quantity <= 0) return null;

  const log = await ConsumptionLog.create({
    userId,
    productName,
    quantity,
    unit,
    reason,
    wasRescue,
  });

  // Skordan bağımsız, tamamen ayrı bir all-time sayaç — bkz. models/User.js
  if (wasRescue) {
    await User.findByIdAndUpdate(userId, { $inc: { rescueCount: 1 } });
  }

  return log;
}

module.exports = { logConsumption };
