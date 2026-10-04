const { isparkPrice, formatTry, parseAmount } = require("./pricing");

// İzmir Büyükşehir Belediyesi açık veri portalı (acikveri.bizizmir.com):
// - "Otopark Doluluk ve Lokasyon Bilgileri" veri setinin canlı API'si
// - "Otopark Ücretleri" veri setinin CSV'si (İZELMAN tarifeleri)
const LIVE_URL = "https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar";
const FEE_CSV_URL =
  "https://acikveri.bizizmir.com/dataset/8863674c-c082-4f55-ab1d-dc75219aca4f/resource/8dca3fb5-b7fe-4f16-91af-d8248da59f87/download/otopark-ucretleri.csv";
const USER_AGENT = "BosverParkingApp/1.0 (localhost; parking-finder)";

const COVERAGE = { south: 38.15, west: 26.5, north: 38.8, east: 27.6 };
const LIVE_TTL_MS = 2 * 60 * 1000;
const FEE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const status = { lastOk: 0, lastError: null, lots: 0, fees: 0 };

let live = { fetchedAt: 0, entries: [] };
let livePromise = null;
let fees = { fetchedAt: 0, byKey: new Map() };
let feePromise = null;

function coversBbox(bbox) {
  return (
    bbox.south <= COVERAGE.north &&
    bbox.north >= COVERAGE.south &&
    bbox.west <= COVERAGE.east &&
    bbox.east >= COVERAGE.west
  );
}

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ü", "u")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replaceAll("ö", "o")
    .replaceAll("ğ", "g")
    .replaceAll("î", "i")
    .replaceAll("â", "a");
}

function nameKey(value) {
  return fold(value)
    .replace(/otopark\w*|otp\.?/g, " ")
    .replace(/yol ?kenari|yol ?alti|katli|yer ?alti|yeralti|acik ?alan|kapali ?alan|tam ?otomatik/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`İzmir açık veri hata: ${res.status}`);
  return res.text();
}

function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function cleanLabel(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function loadFees() {
  if (Date.now() - fees.fetchedAt <= FEE_TTL_MS) return fees.byKey;
  if (feePromise) return feePromise;
  feePromise = getText(FEE_CSV_URL)
    .then((text) => {
      const rows = parseCsv(text);
      const header = (rows.shift() || []).map(cleanLabel);
      const byKey = new Map();
      for (const cells of rows) {
        const name = cleanLabel(cells[0]);
        const key = nameKey(name);
        if (!key) continue;
        const bands = [];
        let monthly = null;
        for (let i = 1; i < header.length; i += 1) {
          const amount = parseAmount(cells[i]);
          if (amount == null || !header[i]) continue;
          if (/abone/i.test(header[i])) {
            if (monthly == null && !/motosiklet/i.test(header[i])) monthly = amount;
            continue;
          }
          bands.push(`${header[i]}:${amount}`);
        }
        if (!bands.length && monthly == null) continue;
        byKey.set(key, { name, tariff: bands.join(";"), monthly });
      }
      fees = { fetchedAt: Date.now(), byKey };
      status.fees = byKey.size;
      return byKey;
    })
    .catch((err) => {
      status.lastError = err.message;
      return fees.byKey;
    })
    .finally(() => {
      feePromise = null;
    });
  return feePromise;
}

function feeFor(name) {
  const key = nameKey(name);
  if (!key) return null;
  const exact = fees.byKey.get(key);
  if (exact) return exact;
  if (key.length < 10) return null;
  for (const [candidate, value] of fees.byKey) {
    if (candidate.length < 10) continue;
    if (candidate.includes(key) || key.includes(candidate)) return value;
  }
  return null;
}

async function loadLive() {
  if (Date.now() - live.fetchedAt <= LIVE_TTL_MS) return live.entries;
  if (livePromise) return livePromise;
  livePromise = getText(LIVE_URL)
    .then((text) => {
      const parsed = JSON.parse(text);
      const entries = (Array.isArray(parsed) ? parsed : []).filter(
        (entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lng))
      );
      live = { fetchedAt: Date.now(), entries };
      status.lastOk = Date.now();
      status.lots = entries.length;
      status.lastError = null;
      return entries;
    })
    .catch((err) => {
      status.lastError = err.message;
      return live.entries;
    })
    .finally(() => {
      livePromise = null;
    });
  return livePromise;
}

function workHoursFor(entry) {
  if (entry.nonstop) return "24 saat";
  const today = entry.openingHours?.[DAY_KEYS[new Date().getDay()]];
  return cleanLabel(today) || null;
}

function featuresFor(entry, price) {
  const features = [];
  features.push(entry.accessories?.covered ? "Kapalı" : "Açık");
  if (entry.type === "OnStreet") features.push("Yol üstü");
  if (entry.accessories?.cctv) features.push("Kamera");
  if (entry.accessories?.barrier) features.push("Bariyerli");
  if (entry.accessibility?.disabled) features.push("Engelli erişimi");
  if (entry.payment?.card) features.push("Kartla ödeme");
  if (entry.payment?.cash) features.push("Nakit");
  if (entry.poi?.metroStation) features.push("Metroya yakın");
  if (entry.poi?.tramStation) features.push("Tramvaya yakın");
  const hours = workHoursFor(entry);
  if (hours) features.push(`Çalışma: ${hours}`);
  if (entry.provider) features.push(cleanLabel(entry.provider));
  if (price.bands.length) features.push("İzmir açık veri tarifeli");
  return features;
}

function freshnessLabel(fetchedAt) {
  if (!fetchedAt) return null;
  const minutes = Math.round((Date.now() - fetchedAt) / 60000);
  return minutes <= 1 ? "az önce güncellendi" : `${minutes} dk önce güncellendi`;
}

function priceFor(entry) {
  const fee = feeFor(entry.name);
  if (fee?.tariff) {
    const price = isparkPrice({ tariff: fee.tariff });
    return {
      ...price,
      monthly: fee.monthly,
      priceNote: `İzmir açık verisi "Otopark Ücretleri" listesinde ${fee.name} tarifesi`,
    };
  }
  if (entry.isPaid === false) {
    return {
      priceLabel: "Ücretsiz",
      isFree: true,
      pricePerHour: null,
      bands: [],
      monthly: null,
      priceNote: "İzmir açık verisinde ücretsiz işaretli",
    };
  }
  return {
    priceLabel: "Ücretli (tarife yayınlanmamış)",
    isFree: false,
    pricePerHour: null,
    bands: [],
    monthly: null,
    priceNote: "Ücretli işaretli, İzmir ücret listesinde bu otopark için satır yok",
  };
}

function mapLot(entry, distanceKm) {
  const price = priceFor(entry);
  const free = Number(entry.occupancy?.total?.free);
  const occupied = Number(entry.occupancy?.total?.occupied);
  const hasEmpty = Number.isFinite(free);
  const total = hasEmpty && Number.isFinite(occupied) ? free + occupied : null;

  const capacityLabel = hasEmpty
    ? total
      ? `${free.toLocaleString("tr-TR")} boş / ${total.toLocaleString("tr-TR")} yer`
      : `${free.toLocaleString("tr-TR")} boş yer`
    : "Kapasite bilgisi yok";

  return {
    id: `izmir_${entry.ufid}`,
    name: cleanLabel(entry.name) || "İzmir Otoparkı",
    city: "İzmir",
    address: cleanLabel(entry.address) || "İzmir",
    lat: Number(entry.lat),
    lng: Number(entry.lng),
    type: entry.accessories?.covered ? "indoor" : "outdoor",
    pricePerHour: price.pricePerHour,
    priceLabel: price.priceLabel,
    priceNote: price.priceNote,
    priceBands: price.bands,
    monthlyFeeLabel: price.monthly > 0 ? formatTry(price.monthly) : null,
    isFree: price.isFree,
    totalSpots: total,
    emptySpots: hasEmpty ? free : null,
    empty: hasEmpty ? free > 0 : null,
    capacityLabel,
    liveOccupancy: hasEmpty,
    occupancyNote: hasEmpty
      ? `Anlık İzmir açık veri · ${freshnessLabel(live.fetchedAt)}`
      : null,
    workHours: workHoursFor(entry),
    freeTimeMinutes: null,
    source: "izmir",
    sourceLabel: "İzmir Açık Veri (İZUM)",
    features: featuresFor(entry, price),
    distanceKm,
    distanceLabel: distanceKm == null ? null : `${distanceKm.toFixed(1)} km`,
  };
}

function inBbox(entry, bbox) {
  const lat = Number(entry.lat);
  const lng = Number(entry.lng);
  return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east;
}

async function lotsForBbox(bbox, distanceFor) {
  if (!coversBbox(bbox)) return [];
  const [entries] = await Promise.all([loadLive(), loadFees()]);
  return entries
    .filter((entry) => inBbox(entry, bbox))
    .map((entry) =>
      mapLot(entry, distanceFor ? distanceFor(Number(entry.lat), Number(entry.lng)) : null)
    );
}

async function lotById(ufid, distanceFor) {
  const [entries] = await Promise.all([loadLive(), loadFees()]);
  const entry = entries.find((item) => String(item.ufid) === String(ufid));
  if (!entry) return null;
  return mapLot(entry, distanceFor ? distanceFor(Number(entry.lat), Number(entry.lng)) : null);
}

async function liveStatuses(ufids) {
  const statuses = new Map();
  if (!ufids.length) return statuses;
  const entries = await loadLive();
  for (const ufid of ufids) {
    const entry = entries.find((item) => String(item.ufid) === String(ufid));
    if (!entry) continue;
    const free = Number(entry.occupancy?.total?.free);
    const occupied = Number(entry.occupancy?.total?.occupied);
    statuses.set(`izmir_${ufid}`, {
      name: cleanLabel(entry.name),
      emptySpots: Number.isFinite(free) ? free : null,
      totalSpots: Number.isFinite(free) && Number.isFinite(occupied) ? free + occupied : null,
      updatedAt: live.fetchedAt,
    });
  }
  return statuses;
}

function warmUp() {
  Promise.all([loadLive(), loadFees()]).catch(() => {});
}

module.exports = {
  COVERAGE,
  coversBbox,
  lotsForBbox,
  lotById,
  liveStatuses,
  warmUp,
  status,
};
