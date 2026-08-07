import type { WasteScoreEvent, WasteScoreRange } from "./api";

export type WasteScoreBucket = {
  label: string;
  consumed: number;
  expired: number;
  events: WasteScoreEvent[];
};

const WEEKDAY_LABELS = ["Pzt", "Sal", "Çrş", "Prş", "Cum", "Cmt", "Paz"];
const MONTH_LABELS = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

function emptyBuckets(labels: string[]): WasteScoreBucket[] {
  return labels.map((label) => ({ label, consumed: 0, expired: 0, events: [] }));
}

function addToBucket(bucket: WasteScoreBucket, event: WasteScoreEvent) {
  if (event.reason === "consumed") bucket.consumed += 1;
  else bucket.expired += 1;
  bucket.events.push(event);
}

// Backend "week"/"month"/"year" için takvim bazlı bir pencere (bu hafta
// Pazartesi'den, bu ayın 1'inden, bu yılın 1 Ocak'ından) döndürüyor — bu
// yüzden burada da "now" içinde bulunulan haftayı/ayı/yılı baz alıyor,
// olayların kendisi zaten o pencerenin dışına çıkamıyor.
export function bucketWasteScoreEvents(
  events: WasteScoreEvent[],
  range: WasteScoreRange
): WasteScoreBucket[] {
  const now = new Date();

  if (range === "week") {
    const buckets = emptyBuckets(WEEKDAY_LABELS);
    for (const event of events) {
      const date = new Date(event.createdAt);
      const index = (date.getDay() + 6) % 7; // Pazartesi=0 ... Pazar=6
      addToBucket(buckets[index], event);
    }
    return buckets;
  }

  if (range === "month") {
    const weekCount = Math.ceil(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() / 7
    );
    const buckets = emptyBuckets(Array.from({ length: weekCount }, (_, i) => `${i + 1}. Hafta`));
    for (const event of events) {
      const date = new Date(event.createdAt);
      const index = Math.min(weekCount - 1, Math.floor((date.getDate() - 1) / 7));
      addToBucket(buckets[index], event);
    }
    return buckets;
  }

  if (range === "year") {
    const buckets = emptyBuckets(MONTH_LABELS);
    for (const event of events) {
      const date = new Date(event.createdAt);
      addToBucket(buckets[date.getMonth()], event);
    }
    return buckets;
  }

  // "all": yıla göre grupla — veri yoksa içinde bulunulan yılı tek (boş)
  // bucket olarak göster, grafik tamamen kaybolmasın.
  const years = Array.from(new Set(events.map((event) => new Date(event.createdAt).getFullYear())));
  if (years.length === 0) years.push(now.getFullYear());
  years.sort((a, b) => a - b);

  const buckets = emptyBuckets(years.map((year) => String(year)));
  const yearIndex = new Map(years.map((year, index) => [year, index]));
  for (const event of events) {
    const year = new Date(event.createdAt).getFullYear();
    addToBucket(buckets[yearIndex.get(year)!], event);
  }
  return buckets;
}
