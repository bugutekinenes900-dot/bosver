const path = require("path");
const Database = require("better-sqlite3");

const CACHE_MS = 30 * 60 * 1000;

const db = new Database(process.env.PARKING_DB || path.join(__dirname, "parking.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS osm_lots (
    osm_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('indoor', 'outdoor')),
    fee TEXT,
    capacity INTEGER,
    address TEXT NOT NULL DEFAULT '',
    features TEXT NOT NULL DEFAULT '[]',
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bbox_cache (
    id INTEGER PRIMARY KEY,
    south REAL NOT NULL,
    west REAL NOT NULL,
    north REAL NOT NULL,
    east REAL NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ispark_lots (
    park_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    capacity INTEGER,
    empty_capacity INTEGER,
    work_hours TEXT,
    park_type TEXT,
    free_time INTEGER,
    district TEXT,
    is_open INTEGER,
    tariff TEXT,
    monthly_fee REAL,
    address TEXT,
    update_date TEXT,
    tariff_fetched_at INTEGER,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ispark_sync (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'plus', 'pro')),
    created_at INTEGER NOT NULL,
    tier_changed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lot_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    source TEXT NOT NULL DEFAULT 'osm',
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, lot_id)
  );

  CREATE TABLE IF NOT EXISTS parking_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lot_id TEXT NOT NULL,
    lot_name TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'osm',
    lat REAL,
    lng REAL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    estimated_fee REAL,
    fee_label TEXT,
    fee_note TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
  CREATE INDEX IF NOT EXISTS idx_parking_sessions_user
    ON parking_sessions(user_id, started_at DESC);
`);

function columnNames(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

function addColumn(table, name, definition) {
  if (columnNames(table).includes(name)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  return true;
}

const OSM_LOT_COLUMNS = [
  ["charge", "TEXT"],
  ["tags", "TEXT NOT NULL DEFAULT '{}'"],
  ["name_norm", "TEXT"],
];

const migrated = OSM_LOT_COLUMNS.map(([name, def]) => addColumn("osm_lots", name, def)).some(
  Boolean
);

if (migrated) {
  db.exec("DELETE FROM bbox_cache");
}

const upsertLot = db.prepare(`
  INSERT INTO osm_lots (osm_id, name, name_norm, lat, lng, type, fee, capacity, address, features, charge, tags, fetched_at)
  VALUES (@osm_id, @name, @name_norm, @lat, @lng, @type, @fee, @capacity, @address, @features, @charge, @tags, @fetched_at)
  ON CONFLICT(osm_id) DO UPDATE SET
    name = excluded.name,
    name_norm = excluded.name_norm,
    lat = excluded.lat,
    lng = excluded.lng,
    type = excluded.type,
    fee = excluded.fee,
    capacity = excluded.capacity,
    address = excluded.address,
    features = excluded.features,
    charge = excluded.charge,
    tags = excluded.tags,
    fetched_at = excluded.fetched_at
`);

const insertBbox = db.prepare(`
  INSERT INTO bbox_cache (south, west, north, east, fetched_at)
  VALUES (@south, @west, @north, @east, @fetched_at)
`);

const selectLotsInBbox = db.prepare(`
  SELECT * FROM osm_lots
  WHERE lat BETWEEN @south AND @north AND lng BETWEEN @west AND @east
`);

const selectBboxes = db.prepare(`
  SELECT * FROM bbox_cache WHERE fetched_at > ?
`);

const selectLot = db.prepare(`SELECT * FROM osm_lots WHERE osm_id = ?`);

function foldName(value) {
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

function saveLots(lots) {
  const now = Date.now();
  const tx = db.transaction((rows) => {
    for (const lot of rows) {
      upsertLot.run({
        ...lot,
        name_norm: lot.name_norm || foldName(lot.name),
        fetched_at: now,
      });
    }
  });
  tx(lots);
}

function saveBbox(bbox) {
  insertBbox.run({ ...bbox, fetched_at: Date.now() });
}

function cachedBboxCovers(bbox) {
  const minTime = Date.now() - CACHE_MS;
  const rows = selectBboxes.all(minTime);
  return rows.some(
    (row) =>
      row.south <= bbox.south &&
      row.west <= bbox.west &&
      row.north >= bbox.north &&
      row.east >= bbox.east
  );
}

function lotsInBbox(bbox) {
  return selectLotsInBbox.all(bbox);
}

function getCachedLot(osmId) {
  return selectLot.get(osmId) || null;
}

const upsertIsparkLot = db.prepare(`
  INSERT INTO ispark_lots (
    park_id, name, lat, lng, capacity, empty_capacity, work_hours, park_type,
    free_time, district, is_open, fetched_at
  )
  VALUES (
    @park_id, @name, @lat, @lng, @capacity, @empty_capacity, @work_hours, @park_type,
    @free_time, @district, @is_open, @fetched_at
  )
  ON CONFLICT(park_id) DO UPDATE SET
    name = excluded.name,
    lat = excluded.lat,
    lng = excluded.lng,
    capacity = excluded.capacity,
    empty_capacity = excluded.empty_capacity,
    work_hours = excluded.work_hours,
    park_type = excluded.park_type,
    free_time = excluded.free_time,
    district = excluded.district,
    is_open = excluded.is_open,
    fetched_at = excluded.fetched_at
`);

const updateIsparkTariff = db.prepare(`
  UPDATE ispark_lots
  SET tariff = @tariff,
      monthly_fee = @monthly_fee,
      address = @address,
      update_date = @update_date,
      tariff_fetched_at = @tariff_fetched_at
  WHERE park_id = @park_id
`);

const selectIsparkInBbox = db.prepare(`
  SELECT * FROM ispark_lots
  WHERE lat BETWEEN @south AND @north AND lng BETWEEN @west AND @east
`);

const selectIsparkLot = db.prepare(`SELECT * FROM ispark_lots WHERE park_id = ?`);
const selectIsparkSync = db.prepare(`SELECT fetched_at FROM ispark_sync WHERE id = 1`);
const upsertIsparkSync = db.prepare(`
  INSERT INTO ispark_sync (id, fetched_at) VALUES (1, @fetched_at)
  ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at
`);

function saveIsparkLots(lots) {
  const now = Date.now();
  const tx = db.transaction((rows) => {
    for (const lot of rows) {
      upsertIsparkLot.run({ ...lot, fetched_at: now });
    }
    upsertIsparkSync.run({ fetched_at: now });
  });
  tx(lots);
}

function saveIsparkDetail(detail) {
  updateIsparkTariff.run({ ...detail, tariff_fetched_at: Date.now() });
}

function isparkSyncedAt() {
  return selectIsparkSync.get()?.fetched_at || 0;
}

function isparkLotsInBbox(bbox) {
  return selectIsparkInBbox.all(bbox);
}

function getIsparkLot(parkId) {
  return selectIsparkLot.get(parkId) || null;
}

const insertUser = db.prepare(`
  INSERT INTO users (email, password_hash, password_salt, tier, created_at)
  VALUES (@email, @password_hash, @password_salt, @tier, @created_at)
`);

const selectUserByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const selectUserById = db.prepare(`SELECT * FROM users WHERE id = ?`);
const updateUserTier = db.prepare(`
  UPDATE users SET tier = @tier, tier_changed_at = @tier_changed_at WHERE id = @id
`);

const insertSession = db.prepare(`
  INSERT INTO sessions (token, user_id, created_at, expires_at)
  VALUES (@token, @user_id, @created_at, @expires_at)
`);

const selectSession = db.prepare(`
  SELECT s.token, s.expires_at, u.* FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ?
`);

const deleteSession = db.prepare(`DELETE FROM sessions WHERE token = ?`);
const deleteExpiredSessions = db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`);

const insertFavorite = db.prepare(`
  INSERT INTO favorites (user_id, lot_id, name, lat, lng, source, created_at)
  VALUES (@user_id, @lot_id, @name, @lat, @lng, @source, @created_at)
  ON CONFLICT(user_id, lot_id) DO UPDATE SET
    name = excluded.name,
    lat = excluded.lat,
    lng = excluded.lng,
    source = excluded.source
`);

const selectFavorites = db.prepare(`
  SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC
`);

const countFavorites = db.prepare(`SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?`);
const deleteFavorite = db.prepare(`DELETE FROM favorites WHERE user_id = ? AND lot_id = ?`);

const insertParkingSession = db.prepare(`
  INSERT INTO parking_sessions (user_id, lot_id, lot_name, source, lat, lng, started_at)
  VALUES (@user_id, @lot_id, @lot_name, @source, @lat, @lng, @started_at)
`);

const selectActiveParkingSession = db.prepare(`
  SELECT * FROM parking_sessions
  WHERE user_id = ? AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
`);

const selectParkingSessions = db.prepare(`
  SELECT * FROM parking_sessions
  WHERE user_id = ?
  ORDER BY started_at DESC
  LIMIT 50
`);

const selectParkingSession = db.prepare(`SELECT * FROM parking_sessions WHERE id = ?`);

const finishParkingSession = db.prepare(`
  UPDATE parking_sessions
  SET ended_at = @ended_at,
      estimated_fee = @estimated_fee,
      fee_label = @fee_label,
      fee_note = @fee_note
  WHERE id = @id AND user_id = @user_id AND ended_at IS NULL
`);

module.exports = {
  db,
  saveLots,
  saveBbox,
  cachedBboxCovers,
  lotsInBbox,
  getCachedLot,
  saveIsparkLots,
  saveIsparkDetail,
  isparkSyncedAt,
  isparkLotsInBbox,
  getIsparkLot,
  insertUser,
  selectUserByEmail,
  selectUserById,
  updateUserTier,
  insertSession,
  selectSession,
  deleteSession,
  deleteExpiredSessions,
  insertFavorite,
  selectFavorites,
  countFavorites,
  deleteFavorite,
  insertParkingSession,
  selectActiveParkingSession,
  selectParkingSessions,
  selectParkingSession,
  finishParkingSession,
};
