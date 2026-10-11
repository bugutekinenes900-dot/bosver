const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "data", "tr-parking.json");
const URLS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];
const USER_AGENT = "BosverParkingApp/1.0 (https://github.com/bugutekinenes900-dot/bosver; parking-finder)";

const SOUTH = 35.8;
const NORTH = 42.2;
const WEST = 25.9;
const EAST = 44.9;
const STEP = 1;

function foldTr(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .replaceAll("ü", "u")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replaceAll("ö", "o")
    .replaceAll("ğ", "g");
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  if (tags.building === "parking" && !place) return "Kapalı otopark";
  return place ? `${place} Otoparkı` : "Otopark";
}

function toRecord(el) {
  const tags = el.tags || {};
  if (tags.amenity === "parking_space") return null;
  if (tags.amenity !== "parking" && tags.building !== "parking") return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < SOUTH - 0.2 || lat > NORTH + 0.2 || lng < WEST - 0.2 || lng > EAST + 0.2) return null;
  const parking = String(tags.parking || "").toLowerCase();
  const indoor =
    tags.building === "parking" ||
    ["underground", "multi-storey", "multistorey", "rooftop", "garage"].includes(parking);
  const address = cleanName(
    [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean).join(" ")
  );
  return {
    id: `${el.type[0]}${el.id}`,
    n: displayName(tags),
    a: Math.round(lat * 1e5) / 1e5,
    o: Math.round(lng * 1e5) / 1e5,
    t: indoor ? "in" : "out",
    f: tags.fee === "no" ? 0 : tags.fee === "yes" ? 1 : null,
    c: tags.capacity ? parseInt(String(tags.capacity).replace(/[^\d]/g, ""), 10) || null : null,
    d: address,
  };
}

async function fetchTile(south, west, north, east) {
  const query = `[out:json][timeout:25];
(
  nwr["amenity"="parking"](${south},${west},${north},${east});
  nwr["building"="parking"](${south},${west},${north},${east});
);
out center tags;`;
  let lastError = null;
  for (const url of URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": USER_AGENT,
        },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(28000),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      return (data.elements || []).map(toRecord).filter(Boolean);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("tile");
}

function tiles() {
  const list = [];
  for (let south = SOUTH; south < NORTH; south += STEP) {
    for (let west = WEST; west < EAST; west += STEP) {
      list.push({
        south: Math.round(south * 10) / 10,
        west: Math.round(west * 10) / 10,
        north: Math.round(Math.min(south + STEP, NORTH) * 10) / 10,
        east: Math.round(Math.min(west + STEP, EAST) * 10) / 10,
      });
    }
  }
  return list;
}

function loadState() {
  if (!fs.existsSync(OUT)) return { done: {}, lots: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(OUT, "utf8"));
    const lots = {};
    for (const lot of parsed.lots || []) lots[lot.id] = lot;
    return { done: parsed.done || {}, lots };
  } catch {
    return { done: {}, lots: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const body = {
    done: state.done,
    lots: Object.values(state.lots),
  };
  fs.writeFileSync(OUT, JSON.stringify(body));
}

async function main() {
  const state = loadState();
  const pending = tiles().filter((tile) => !state.done[`${tile.south},${tile.west}`]);
  console.log("tiles", tiles().length, "pending", pending.length, "lots", Object.keys(state.lots).length);
  for (const tile of pending) {
    const key = `${tile.south},${tile.west}`;
    try {
      const rows = await fetchTile(tile.south, tile.west, tile.north, tile.east);
      for (const row of rows) state.lots[row.id] = row;
      state.done[key] = rows.length;
      saveState(state);
      console.log(key, rows.length, "total", Object.keys(state.lots).length);
    } catch (err) {
      console.log(key, "FAIL", err.message);
    }
  }
  console.log("finished", Object.keys(state.lots).length);
}

main();
