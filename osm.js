const fs = require("fs");
const path = require("path");
const { saveLots, saveBbox, cachedBboxCovers, lotsInBbox, getCachedLot } = require("./db");
const { osmPrice, osmCapacity } = require("./pricing");
const { isOpenNow } = require("./hours");
const ispark = require("./ispark");
const izmir = require("./izmir");

const USER_AGENT = "BosverParkingApp/1.0 (https://github.com/bugutekinenes900-dot/bosver; parking-finder)";
const OVERPASS_URLS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MAX_BBOX_KM = 2500;
const SEARCH_RADIUS_KM = 18;
const MAP_SEND_MAX = 3000;
const PROVINCES = require("./provinces");
const TURKEY = { south: 35.8, west: 25.9, north: 42.2, east: 44.9 };
const OVERPASS_TIMEOUT_MS = 4500;
const LIVE_TIMEOUT_MS = 2000;
const MAX_LOTS = 500;
const DEDUPE_KM = 0.08;

const PRICE_TAGS = [
  "charge",
  "fee:conditional",
  "charge:conditional",
  "parking:fee",
  "maxstay",
  "opening_hours",
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bboxSizeKm(bbox) {
  const latKm = haversineKm(bbox.south, bbox.west, bbox.north, bbox.west);
  const lngKm = haversineKm(bbox.south, bbox.west, bbox.south, bbox.east);
  return Math.max(latKm, lngKm);
}

function boxAround(lat, lng, km) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  return {
    south: lat - dLat,
    north: lat + dLat,
    west: lng - dLng,
    east: lng + dLng,
  };
}

function distanceHelper(origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return () => null;
  }
  return (lat, lng) => haversineKm(origin.lat, origin.lng, lat, lng);
}

function indoorFromTags(tags) {
  if (tags.building === "parking") return true;
  const parking = (tags.parking || "").toLowerCase();
  return ["underground", "multi-storey", "multistorey", "rooftop", "garage"].includes(
    parking
  );
}

function parseCapacity(value) {
  if (!value) return null;
  const n = parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function priceTagsFrom(tags) {
  const picked = {};
  for (const key of PRICE_TAGS) {
    if (tags[key]) picked[key] = String(tags[key]);
  }
  return picked;
}

function featuresFromTags(tags, indoor, fee) {
  const features = [];
  features.push(indoor ? "Kapalı" : "Açık");
  if (fee === "no") features.push("Ücretsiz");
  if (fee === "yes") features.push("Ücretli");
  if (tags.supervised === "yes") features.push("Görevli");
  if (tags.surveillance === "yes") features.push("Kamera");
  if (tags.capacity) features.push(`Kapasite ${tags.capacity}`);
  if (tags.maxstay) features.push(`Azami süre: ${tags.maxstay}`);
  if (tags.opening_hours) features.push(`Çalışma: ${tags.opening_hours}`);
  if (tags.access && tags.access !== "yes") features.push(tags.access);
  return features;
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function foldTr(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .replaceAll("ü", "u")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replaceAll("ö", "o")
    .replaceAll("ğ", "g")
    .replaceAll("î", "i")
    .replaceAll("â", "a");
}

function isGenericName(name) {
  const n = foldTr(name).replace(/[^a-z0-9]+/g, "");
  return !n || n === "otopark" || n === "parking" || n === "p";
}

function displayName(tags) {
  const tagged = cleanName(tags["name:tr"] || tags.name || "");
  if (tagged && !isGenericName(tagged)) return tagged;

  const street = cleanName(tags["addr:street"]);
  const house = cleanName(tags["addr:housenumber"]);
  const streetLine = [street, house].filter(Boolean).join(" ");
  const place =
    streetLine ||
    cleanName(tags["addr:district"]) ||
    cleanName(tags["addr:city"]) ||
    cleanName(tags.operator);
  return place ? `${place} Otoparkı` : "Otopark";
}

function displayNameFromCache(name, address) {
  const tagged = cleanName(name);
  if (tagged && !isGenericName(tagged)) return tagged;
  const place = cleanName(address);
  return place ? `${place} Otoparkı` : tagged || "Otopark";
}

function queryScore(lot, needle) {
  if (!needle) return 0;
  if (foldTr(lot.name).includes(needle)) return 2;
  if (foldTr(lot.address).includes(needle)) return 1;
  return 0;
}

function rankByQuery(lots, needle) {
  if (!needle) return lots;
  return lots
    .map((lot, index) => ({ lot, index, score: queryScore(lot, needle) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.lot);
}

function elementToLot(el) {
  const tags = el.tags || {};
  if (tags.amenity === "parking_space") return null;
  if (tags.amenity !== "parking" && tags.building !== "parking") return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const indoor = indoorFromTags(tags);
  const fee = tags.fee === "no" || tags.fee === "yes" ? tags.fee : null;
  const address = cleanName(
    [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]]
      .filter(Boolean)
      .join(" ")
  );
  let name = displayName(tags);
  if (tags.building === "parking" && (name === "Otopark" || isGenericName(name))) {
    name = "Kapalı otopark";
  }

  return {
    osm_id: `${el.type}_${el.id}`,
    name,
    name_norm: foldTr(name),
    lat,
    lng,
    type: indoor ? "indoor" : "outdoor",
    fee,
    capacity: parseCapacity(tags.capacity),
    address,
    features: JSON.stringify(featuresFromTags(tags, indoor, fee)),
    charge: tags.charge ? String(tags.charge) : null,
    tags: JSON.stringify(priceTagsFrom(tags)),
  };
}

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mapLot(row, origin) {
  const features = JSON.parse(row.features || "[]");
  const tags = parseTags(row.tags);
  const chargeText = row.charge || tags["parking:fee"] || tags["charge:conditional"] || null;
  const price = osmPrice({ fee: row.fee, charge: chargeText });

  const notes = [];
  if (price.priceNote) notes.push(price.priceNote);
  if (!row.charge && tags["charge:conditional"]) {
    notes.push(`Koşullu tarife: ${tags["charge:conditional"]}`);
  }
  if (tags["fee:conditional"]) notes.push(`Koşullu ücret: ${tags["fee:conditional"]}`);
  if (tags.maxstay) notes.push(`Azami süre: ${tags.maxstay}`);

  const distanceKm =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? haversineKm(origin.lat, origin.lng, row.lat, row.lng)
      : null;

  return {
    id: row.osm_id,
    name: displayNameFromCache(row.name, row.address),
    city: "",
    address: cleanName(row.address),
    lat: row.lat,
    lng: row.lng,
    type: row.type,
    pricePerHour: price.pricePerHour,
    priceLabel: price.priceLabel,
    priceNote: notes.length ? notes.join(" · ") : null,
    priceBands: [],
    monthlyFeeLabel: null,
    isFree: price.isFree,
    totalSpots: row.capacity,
    emptySpots: null,
    empty: null,
    capacityLabel: osmCapacity(row.capacity),
    liveOccupancy: false,
    occupancyNote: "OpenStreetMap anlık doluluk vermez",
    workHours: tags.opening_hours || null,
    freeTimeMinutes: null,
    source: "osm",
    sourceLabel: "OpenStreetMap",
    features,
    distanceKm,
    distanceLabel: distanceKm == null ? null : `${distanceKm.toFixed(1)} km`,
  };
}

let cityCountCache = null;

function cityCounts() {
  if (cityCountCache) return cityCountCache;
  const counts = PROVINCES.map((province) => ({ ...province, count: 0 }));
  for (const row of turkeyLots()) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < counts.length; i += 1) {
      const dLat = row.a - counts[i].lat;
      const dLng = row.o - counts[i].lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    }
    counts[best].count += 1;
  }
  cityCountCache = counts;
  return cityCountCache;
}

function dedupe(primary, secondary) {
  const kept = secondary.filter(
    (lot) =>
      !primary.some((main) => haversineKm(main.lat, main.lng, lot.lat, lot.lng) < DEDUPE_KM)
  );
  return primary.concat(kept);
}

function sortLots(lots, sort) {
  const byDistance = (a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return a.name.localeCompare(b.name, "tr");
  };

  if (sort === "empty") {
    return lots.sort((a, b) => {
      const ae = a.emptySpots ?? -1;
      const be = b.emptySpots ?? -1;
      if (ae !== be) return be - ae;
      return byDistance(a, b);
    });
  }
  if (sort === "price") {
    return lots.sort((a, b) => {
      const ap = a.isFree ? 0 : (a.pricePerHour ?? Number.POSITIVE_INFINITY);
      const bp = b.isFree ? 0 : (b.pricePerHour ?? Number.POSITIVE_INFINITY);
      if (ap !== bp) return ap - bp;
      return byDistance(a, b);
    });
  }
  return lots.sort(byDistance);
}

// Canlı doluluk veren kayıtlar (İSPARK / İzmir), yalnızca mesafe sıralaması yüzünden
// listenin dışında kalmasın diye kontenjanlı tutulur. Veri uydurulmaz, sadece
// zaten bölgede bulunan canlı kayıtlar öne alınır.
function withLiveQuota(sorted, max, sort) {
  const head = sorted.slice(0, max);
  const reserve = Math.max(1, Math.floor(max / 4));
  const liveInHead = head.filter((lot) => lot.liveOccupancy).length;
  if (liveInHead >= reserve) return head;

  const promoted = sorted
    .slice(max)
    .filter((lot) => lot.liveOccupancy)
    .slice(0, reserve - liveInHead);
  if (!promoted.length) return head;

  const live = head.filter((lot) => lot.liveOccupancy);
  const still = head.filter((lot) => !lot.liveOccupancy).slice(0, max - live.length - promoted.length);
  return sortLots(live.concat(promoted, still), sort);
}

function applyFilters(lots, { type, free, onlyEmpty, sort, limit, maxPrice, openNow, query }) {
  let mapped = lots;
  if (type === "indoor" || type === "outdoor") {
    mapped = mapped.filter((lot) => lot.type === type);
  }
  if (free) {
    mapped = mapped.filter((lot) => lot.isFree === true);
  }
  if (onlyEmpty) {
    mapped = mapped.filter((lot) => lot.liveOccupancy && lot.empty === true);
  }
  if (maxPrice != null) {
    mapped = mapped.filter((lot) => {
      if (lot.isFree) return true;
      if (lot.pricePerHour == null) return true;
      return lot.pricePerHour <= maxPrice;
    });
  }
  if (openNow) {
    mapped = mapped.filter((lot) => isOpenNow(lot.workHours) !== false);
  }
  mapped = sortLots(mapped, sort);

  const needle = foldTr(query);
  mapped = rankByQuery(mapped, needle);

  const total = mapped.length;
  const max = limit || MAX_LOTS;
  if (total <= max) return { lots: mapped, total, limited: false };
  return { lots: rankByQuery(withLiveQuota(mapped, max, sort), needle), total, limited: true };
}

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

async function fetchOverpass(bbox) {
  const queryBox = bboxSizeKm(bbox) > 10 ? boxAround((bbox.south + bbox.north) / 2, (bbox.west + bbox.east) / 2, 5) : bbox;
  const box = `${queryBox.south},${queryBox.west},${queryBox.north},${queryBox.east}`;
  const garages = bboxSizeKm(queryBox) <= 8 ? `\n  nwr["building"="parking"](${box});` : "";
  const query = `[out:json][timeout:4];
(
  nwr["amenity"="parking"](${box});${garages}
);
out center tags;`;
  const body = "data=" + encodeURIComponent(query);
  let lastError = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": USER_AGENT,
        },
        body,
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Overpass hata: ${res.status}`);
      const data = await res.json();
      const lots = (data.elements || []).map(elementToLot).filter(Boolean);
      if (lots.length) return lots;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return [];
}

const geoCache = new Map();

async function geocode(q) {
  const key = foldTr(q);
  if (geoCache.has(key)) return geoCache.get(key);
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "tr");
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(3500),
  });
  if (!res.ok) throw new Error(`Nominatim hata: ${res.status}`);
  const results = await res.json();
  if (!results.length) return null;
  const span = (hit) => {
    const box = hit.boundingbox || [];
    return Math.max(
      Math.abs(Number(box[1]) - Number(box[0])) || 99,
      Math.abs(Number(box[3]) - Number(box[2])) || 99
    );
  };
  const hit = results.find((item) => {
    const size = span(item);
    return size >= 0.03 && size <= 0.7;
  }) || results[0];
  const place = {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    label: hit.display_name,
  };
  geoCache.set(key, place);
  return place;
}

let turkeyCache = null;

function turkeyLots() {
  if (turkeyCache) return turkeyCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "tr-parking.json"), "utf8"));
    turkeyCache = Array.isArray(parsed.lots) ? parsed.lots : [];
  } catch {
    turkeyCache = [];
  }
  return turkeyCache;
}

function inTurkey(bbox) {
  const lat = (bbox.south + bbox.north) / 2;
  const lng = (bbox.west + bbox.east) / 2;
  return lat >= TURKEY.south && lat <= TURKEY.north && lng >= TURKEY.west && lng <= TURKEY.east;
}

function mapLocal(row, origin) {
  return mapLot(
    {
      osm_id: row.id,
      name: row.n,
      lat: row.a,
      lng: row.o,
      type: row.t === "in" ? "indoor" : "outdoor",
      fee: row.f === 0 ? "no" : row.f === 1 ? "yes" : null,
      capacity: row.c || null,
      address: row.d || "",
      features: JSON.stringify([row.t === "in" ? "Kapalı" : "Açık"]),
      charge: null,
      tags: "{}",
    },
    origin
  );
}

function localLots(bbox, origin) {
  return turkeyLots()
    .filter((row) => row.a >= bbox.south && row.a <= bbox.north && row.o >= bbox.west && row.o <= bbox.east)
    .map((row) => mapLocal(row, origin));
}

function spreadLots(lots, max, bbox) {
  if (lots.length <= max) return lots;
  const cols = Math.ceil(Math.sqrt(max / 3));
  const rows = Math.max(1, cols);
  const latStep = (bbox.north - bbox.south) / rows || 1;
  const lngStep = (bbox.east - bbox.west) / cols || 1;
  const cells = new Map();
  for (const lot of lots) {
    const row = Math.min(rows - 1, Math.max(0, Math.floor((lot.lat - bbox.south) / latStep)));
    const col = Math.min(cols - 1, Math.max(0, Math.floor((lot.lng - bbox.west) / lngStep)));
    const key = `${row}:${col}`;
    const list = cells.get(key);
    if (list) {
      if (list.length < 6) list.push(lot);
    } else {
      cells.set(key, [lot]);
    }
  }
  const spread = [];
  for (const list of cells.values()) spread.push(...list);
  return spread.slice(0, max);
}

async function osmLotsForBbox(bbox, origin) {
  if (turkeyLots().length && inTurkey(bbox)) return localLots(bbox, origin);
  if (!cachedBboxCovers(bbox)) {
    try {
      const fetched = await fetchOverpass(bbox);
      if (fetched.length) {
        saveLots(fetched);
        saveBbox(bbox);
      }
    } catch {
      /* zaman aşımında eldeki kayıtlar döner */
    }
  }
  return lotsInBbox(bbox).map((row) => mapLot(row, origin));
}

async function lotsForBbox(bbox, options = {}) {
  if (bboxSizeKm(bbox) > MAX_BBOX_KM) {
    const err = new Error("Haritayı biraz yaklaştırın");
    err.code = "bbox_too_large";
    throw err;
  }

  const { origin } = options;
  const wide = bboxSizeKm(bbox) > 80;
  const distance = distanceHelper(origin);
  const osmLots = await osmLotsForBbox(bbox, origin);
  const [isparkLots, izmirLots] = wide
    ? [[], []]
    : await Promise.all([
        withTimeout(ispark.lotsForBbox(bbox, distance), LIVE_TIMEOUT_MS, []),
        withTimeout(izmir.lotsForBbox(bbox, distance), LIVE_TIMEOUT_MS, []),
      ]);

  const merged = dedupe(isparkLots.concat(izmirLots), osmLots);
  const filtered = applyFilters(merged, {
    ...options,
    limit: options.query ? options.limit : 100000,
  });
  if (!options.query && filtered.lots.length > MAP_SEND_MAX) {
    return {
      lots: spreadLots(filtered.lots, MAP_SEND_MAX, bbox),
      total: filtered.total,
      limited: false,
    };
  }
  return filtered;
}

async function lotsForQuery(q, options = {}) {
  let place = null;
  try {
    place = await geocode(q);
  } catch {
    place = null;
  }
  if (!place) {
    return { lots: [], total: 0, limited: false, center: null, label: null };
  }
  const bbox = boxAround(place.lat, place.lng, SEARCH_RADIUS_KM);
  const result = await lotsForBbox(bbox, {
    ...options,
    query: q,
    origin: options.origin || { lat: place.lat, lng: place.lng },
  });
  return { ...result, center: place, bbox, label: place.label };
}

async function getLot(id, origin) {
  if (String(id).startsWith("ispark_")) {
    const parkId = Number(String(id).slice("ispark_".length));
    if (!Number.isFinite(parkId)) return null;
    return ispark.lotById(parkId, distanceHelper(origin));
  }
  if (String(id).startsWith("izmir_")) {
    return izmir.lotById(String(id).slice("izmir_".length), distanceHelper(origin));
  }
  const row = getCachedLot(id);
  return row ? mapLot(row, origin) : null;
}

module.exports = {
  lotsForBbox,
  lotsForQuery,
  cityCounts,
  getLot,
  boxAround,
  haversineKm,
  foldTr,
  MAX_LOTS,
};
