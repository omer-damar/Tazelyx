const ConsumptionLog = require("../models/ConsumptionLog");
const User = require("../models/User");
const config = require("../config");

const VALID_RANGES = ["week", "month", "year", "all"];
const DAY_MS = 24 * 60 * 60 * 1000;

function isValidRange(range) {
  return range === undefined || VALID_RANGES.includes(range);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// Skorun/grafiğin "bu dönem" hissi takvim bazlıdır ("haftalık" = Pazartesi'den
// bugüne, "son 7 gün" değil) — detay ekranındaki gün/hafta/ay isimli grafik
// etiketleriyle birebir örtüşür.
function getCalendarRangeStart(range, now) {
  if (!range || range === "all") return null;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "week") {
    const day = start.getDay(); // 0 = Pazar
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diffToMonday);
  } else if (range === "month") {
    start.setDate(1);
  } else if (range === "year") {
    start.setMonth(0, 1);
  }

  return start;
}

// skor = 100 * Σ(ağırlık_i * iyilik_i) / Σ(ağırlık_i)
// ağırlık_i = WASTE_SCORE_DECAY ^ (bugünden kaç gün önce olduğu)
// iyilik_i  = 1 (consumed) veya 0 (expired)
// "quantity_reduced"/"unspecified" logları skora hiç girmiyor — sadece
// tam bir tüketim/israf kararı temsil eden consumed/expired sayılıyor.
async function computeWasteScore(userId, range) {
  const now = new Date();
  const rangeStart = getCalendarRangeStart(range, now);

  const query = { userId, reason: { $in: ["consumed", "expired"] } };
  if (rangeStart) query.createdAt = { $gte: rangeStart };

  const logs = await ConsumptionLog.find(query)
    .select("productName reason wasRescue createdAt")
    .sort({ createdAt: 1 })
    .lean();

  let weightedGoodnessSum = 0;
  let weightSum = 0;
  let rescueBonus = 0;
  let consumedCount = 0;
  let expiredCount = 0;

  for (const log of logs) {
    const daysAgo = Math.max(0, (now.getTime() - new Date(log.createdAt).getTime()) / DAY_MS);
    const weight = Math.pow(config.WASTE_SCORE_DECAY, daysAgo);

    weightSum += weight;
    if (log.reason === "consumed") {
      weightedGoodnessSum += weight;
      consumedCount += 1;
    } else {
      expiredCount += 1;
    }
    if (log.wasRescue) rescueBonus += config.RESCUE_BONUS_PER_EVENT;
  }

  rescueBonus = Math.min(rescueBonus, config.RESCUE_BONUS_CAP);

  const baseScore = weightSum > 0 ? (100 * weightedGoodnessSum) / weightSum : null;
  const score = baseScore === null ? null : Math.min(100, round1(baseScore + rescueBonus));

  const user = await User.findById(userId).select("rescueCount").lean();

  return {
    score,
    eventCount: logs.length,
    consumedCount,
    expiredCount,
    rescueBonus: round1(rescueBonus),
    totalRescueCount: user?.rescueCount || 0,
    // Ham olay listesi — grafik dönemine göre (gün/hafta/ay/yıl) bucket'lara
    // ayırmak ve bir bucket'a dokununca ürün kategorisi kırılımı göstermek
    // istemci tarafında yapılıyor (bkz. client/src/lib/wasteScoreBuckets.ts),
    // bu yüzden backend sadece ham veriyi döndürüyor.
    events: logs.map((log) => ({
      productName: log.productName,
      reason: log.reason,
      wasRescue: log.wasRescue,
      createdAt: log.createdAt,
    })),
  };
}

module.exports = { computeWasteScore, isValidRange };
