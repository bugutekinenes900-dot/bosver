const {
  saveIsparkLots,
  saveIsparkDetail,
  isparkSyncedAt,
  isparkLotsInBbox,
  getIsparkLot,
} = require("./db");
const { isparkPrice, formatTry } = require("./pricing");

const LIST_URL = "https://api.ibb.gov.tr/ispark/Park";
const DETAIL_URL = "https://api.ibb.gov.tr/ispark/ParkDetay";
const USER_AGENT = "BosverParkingApp/1.0 (https://github.com/bugutekinenes900-dot/bosver; parking-finder)";

const LIST_TTL_MS = 2 * 60 * 1000;
const TARIFF_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12000;
const DETAIL_CONCURRENCY = 6;
const DETAIL_PER_REQUEST = 60;

const COVERAGE = { south: 40.6, west: 28.4, north: 41.4, east: 29.5 };

const status = { lastOk: 0, lastError: null, lots: 0 };
let listPromise = null;

function coversBbox(bbox) {
  return (
    bbox.south <= COVERAGE.north &&
    bbox.north >= COVERAGE.south &&
    bbox.west <= COVERAGE.east &&
    bbox.east >= COVERAGE.west
  );
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`İSPARK hata: ${res.status}`);
  return res.json();
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      try {
        await fn(item);
      } catch (err) {
        status.lastError = err.message;
      }
    }
  });
  await Promise.all(workers);
}

function toRow(entry) {
  const lat = Number(entry.lat);
  const lng = Number(entry.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const parkId = Number(entry.parkID);
  if (!Number.isFinite(parkId)) return null;
  return {
    park_id: parkId,
    name: entry.parkName || "İSPARK Otoparkı",
    lat,
    lng,
    capacity: Number.isFinite(Number(entry.capacity)) ? Number(entry.capacity) : null,
    empty_capacity: Number.isFinite(Number(entry.emptyCapacity))
      ? Number(entry.emptyCapacity)
      : null,
    work_hours: entry.workHours || null,
    park_type: entry.parkType || null,
    free_time: Number.isFinite(Number(entry.freeTime)) ? Number(entry.freeTime) : null,
    district: entry.district || null,
    is_open: entry.isOpen == null ? null : Number(entry.isOpen),
  };
}

async function syncList() {
  if (listPromise) return listPromise;
  listPromise = (async () => {
    const data = await getJson(LIST_URL);
    const rows = (Array.isArray(data) ? data : []).map(toRow).filter(Boolean);
    if (rows.length) {
      saveIsparkLots(rows);
      status.lastOk = Date.now();
      status.lots = rows.length;
      status.lastError = null;
    }
    return rows.length;
  })()
    .catch((err) => {
      status.lastError = err.message;
      return 0;
    })
    .finally(() => {
      listPromise = null;
    });
  return listPromise;
}

async function ensureList() {
  if (Date.now() - isparkSyncedAt() <= LIST_TTL_MS) return;
  await syncList();
}

async function fetchDetail(parkId) {
  const data = await getJson(`${DETAIL_URL}?id=${encodeURIComponent(parkId)}`);
  const entry = Array.isArray(data) ? data[0] : data;
  if (!entry) return;
  saveIsparkDetail({
    park_id: parkId,
    tariff: entry.tariff || null,
    monthly_fee: Number.isFinite(Number(entry.monthlyFee)) ? Number(entry.monthlyFee) : null,
    address: entry.address || entry.locationName || null,
    update_date: entry.updateDate || null,
  });
}

async function ensureTariffs(rows) {
  const minTime = Date.now() - TARIFF_TTL_MS;
  const stale = rows.filter((row) => !row.tariff || (row.tariff_fetched_at || 0) < minTime);
  if (!stale.length) return;
  await mapLimit(stale.slice(0, DETAIL_PER_REQUEST), DETAIL_CONCURRENCY, (row) =>
    fetchDetail(row.park_id)
  );
}

function typeFromParkType(parkType) {
  return String(parkType || "").toUpperCase().includes("KAPALI") ? "indoor" : "outdoor";
}

function freshnessLabel(fetchedAt) {
  if (!fetchedAt) return null;
  const minutes = Math.round((Date.now() - fetchedAt) / 60000);
  if (minutes <= 1) return "az önce güncellendi";
  return `${minutes} dk önce güncellendi`;
}

function featuresFor(row, price) {
  const features = [];
  const parkType = String(row.park_type || "").toUpperCase();
  if (parkType.includes("YOL")) features.push("Yol üstü");
  else features.push(typeFromParkType(row.park_type) === "indoor" ? "Kapalı" : "Açık");
  if (row.free_time > 0) features.push(`İlk ${row.free_time} dk ücretsiz`);
  if (row.work_hours) features.push(`Çalışma: ${row.work_hours}`);
  if (row.capacity) features.push(`Kapasite ${row.capacity}`);
  if (row.monthly_fee > 0) features.push(`Aylık ${formatTry(row.monthly_fee)}`);
  if (row.district) features.push(row.district);
  if (price.bands.length) features.push("İSPARK tarifeli");
  return features;
}

function mapLot(row, distanceKm) {
  const price = isparkPrice(row);
  const capacity = row.capacity ?? null;
  const empty = row.empty_capacity;
  const hasEmpty = Number.isFinite(empty);
  const freshness = freshnessLabel(row.fetched_at);

  const capacityLabel = hasEmpty
    ? capacity
      ? `${empty.toLocaleString("tr-TR")} boş / ${capacity.toLocaleString("tr-TR")} yer`
      : `${empty.toLocaleString("tr-TR")} boş yer`
    : capacity
      ? `${capacity.toLocaleString("tr-TR")} araçlık`
      : "Kapasite bilgisi yok";

  return {
    id: `ispark_${row.park_id}`,
    name: row.name,
    city: "İstanbul",
    address: row.address || row.district || "İstanbul",
    lat: row.lat,
    lng: row.lng,
    type: typeFromParkType(row.park_type),
    pricePerHour: price.pricePerHour,
    priceLabel: price.priceLabel,
    priceNote: price.priceNote,
    priceBands: price.bands,
    monthlyFeeLabel: row.monthly_fee > 0 ? formatTry(row.monthly_fee) : null,
    isFree: price.isFree,
    totalSpots: capacity,
    emptySpots: hasEmpty ? empty : null,
    empty: hasEmpty ? empty > 0 : null,
    capacityLabel,
    liveOccupancy: hasEmpty,
    occupancyNote: hasEmpty ? `Anlık İSPARK verisi · ${freshness}` : null,
    workHours: row.work_hours || null,
    freeTimeMinutes: row.free_time || null,
    source: "ispark",
    sourceLabel: "İSPARK (İBB Açık Veri)",
    features: featuresFor(row, price),
    distanceKm,
    distanceLabel: distanceKm == null ? null : `${distanceKm.toFixed(1)} km`,
  };
}

async function lotsForBbox(bbox, distanceFor) {
  if (!coversBbox(bbox)) return [];
  await ensureList();
  const rows = isparkLotsInBbox(bbox);
  if (!rows.length) return [];

  const withDistance = rows.map((row) => ({
    row,
    distanceKm: distanceFor ? distanceFor(row.lat, row.lng) : null,
  }));
  withDistance.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    return 0;
  });

  await ensureTariffs(withDistance.map((item) => item.row));

  return withDistance.map((item) => {
    const fresh = getIsparkLot(item.row.park_id) || item.row;
    return mapLot(fresh, item.distanceKm);
  });
}

async function lotById(parkId, distanceFor) {
  await ensureList();
  const row = getIsparkLot(parkId);
  if (!row) return null;
  await ensureTariffs([row]);
  const fresh = getIsparkLot(parkId) || row;
  return mapLot(fresh, distanceFor ? distanceFor(fresh.lat, fresh.lng) : null);
}

async function liveStatuses(parkIds) {
  const statuses = new Map();
  if (!parkIds.length) return statuses;
  await ensureList();
  for (const parkId of parkIds) {
    const row = getIsparkLot(parkId);
    if (!row) continue;
    statuses.set(`ispark_${parkId}`, {
      name: row.name,
      emptySpots: Number.isFinite(row.empty_capacity) ? row.empty_capacity : null,
      totalSpots: row.capacity ?? null,
      updatedAt: row.fetched_at,
    });
  }
  return statuses;
}

function warmTariffs() {
  syncList()
    .then(() => {
      const rows = isparkLotsInBbox(COVERAGE);
      const minTime = Date.now() - TARIFF_TTL_MS;
      const stale = rows.filter(
        (row) => !row.tariff || (row.tariff_fetched_at || 0) < minTime
      );
      if (!stale.length) return null;
      return mapLimit(stale, 4, (row) => fetchDetail(row.park_id));
    })
    .catch(() => {});
}

module.exports = {
  COVERAGE,
  coversBbox,
  lotsForBbox,
  lotById,
  liveStatuses,
  syncList,
  warmTariffs,
  status,
};
