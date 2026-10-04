const crypto = require("node:crypto");
const {
  insertUser,
  selectUserByEmail,
  selectUserById,
  updateUserTier,
  insertSession,
  selectSession,
  deleteSession,
  deleteExpiredSessions,
} = require("./db");

const COOKIE_NAME = "bosver_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const KEY_LENGTH = 64;

const TIERS = {
  free: {
    key: "free",
    name: "Ücretsiz",
    priceLabel: "₺0",
    periodLabel: "sonsuza kadar",
    maxResults: 20,
    favoriteLimit: 0,
    liveEmptyFilter: false,
    advancedSort: false,
    export: false,
    maxPriceFilter: false,
    openNowFilter: false,
    recommended: false,
    hook: "Haritayı dene, sonra Plus'a geç.",
    perks: [
      "Haritada gerçek otoparkları gör",
      "En yakın 20 sonucu incele",
      "Kapalı / açık / ücretsiz süz",
      "Google ile yol tarifi al",
      "Park ettim / çıktım: süre ve tahmini ücret",
    ],
  },
  plus: {
    key: "plus",
    name: "Plus",
    priceLabel: "₺49",
    periodLabel: "ay",
    maxResults: 200,
    favoriteLimit: 50,
    liveEmptyFilter: true,
    advancedSort: false,
    export: false,
    maxPriceFilter: false,
    openNowFilter: false,
    recommended: true,
    hook: "Günlük kullanım için en mantıklısı.",
    perks: [
      "Ücretsiz'deki 20 yerine 200 otopark",
      "50 favori — ev, iş, AVM ayrı",
      "Sadece boş yeri olanları göster (İSPARK canlı)",
      "İBB anlık doluluk: kaç yer boş",
      "Boş yer uyarısı: favorinde yer açılınca bildirim (İSPARK / İzmir canlı)",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceLabel: "₺99",
    periodLabel: "ay",
    maxResults: 500,
    favoriteLimit: 500,
    liveEmptyFilter: true,
    advancedSort: true,
    export: true,
    maxPriceFilter: true,
    openNowFilter: true,
    recommended: false,
    hook: "Park etmeden fiyatı ve kapı saatini kes.",
    perks: [
      "Plus'taki her şey — 200 değil, 500 otopark",
      "500 favori: tüm güzergâhların tek listede",
      "500 favorinin tamamı için boş yer uyarısı",
      "İSPARK canlı boş yer + sadece müsait olanlar",
      "En boş / en ucuz sıralama: doluya veya pahalıya sapma",
      "₺150 tavan: bütçeni aşan tarifeyi gizle",
      "Şu an açık olanlar: kapalı kapıya gitme",
      "CSV / GeoJSON: ofise veya navigasyona aktar",
    ],
  },
};

const GUEST_TIER = TIERS.free;

function tierFor(key) {
  return TIERS[key] || GUEST_TIER;
}

function publicTiers() {
  return Object.values(TIERS).map((tier) => ({
    key: tier.key,
    name: tier.name,
    priceLabel: tier.priceLabel,
    periodLabel: tier.periodLabel,
    maxResults: tier.maxResults,
    favoriteLimit: tier.favoriteLimit,
    liveEmptyFilter: tier.liveEmptyFilter,
    advancedSort: tier.advancedSort,
    export: tier.export,
    maxPriceFilter: tier.maxPriceFilter,
    openNowFilter: tier.openNowFilter,
    recommended: tier.recommended,
    hook: tier.hook,
    perks: tier.perks,
  }));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const expected = Buffer.from(hash, "hex");
  const candidate = crypto.scryptSync(password, salt, expected.length || KEY_LENGTH);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return "Geçerli bir e-posta adresi girin";
  }
  if (String(password || "").length < 6) {
    return "Parola en az 6 karakter olmalı";
  }
  return null;
}

function parseCookies(header) {
  const jar = {};
  String(header || "")
    .split(";")
    .forEach((part) => {
      const idx = part.indexOf("=");
      if (idx === -1) return;
      const key = part.slice(0, idx).trim();
      if (key) jar[key] = decodeURIComponent(part.slice(idx + 1).trim());
    });
  return jar;
}

function createUser(email, password) {
  const { hash, salt } = hashPassword(password);
  const info = insertUser.run({
    email,
    password_hash: hash,
    password_salt: salt,
    tier: "free",
    created_at: Date.now(),
  });
  return selectUserById.get(info.lastInsertRowid);
}

function createSession(res, userId) {
  deleteExpiredSessions.run(Date.now());
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  insertSession.run({
    token,
    user_id: userId,
    created_at: now,
    expires_at: now + SESSION_TTL_MS,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
  return token;
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) deleteSession.run(token);
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

function attachUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const row = token ? selectSession.get(token, Date.now()) : null;
  req.user = row
    ? { id: row.id, email: row.email, tier: row.tier, createdAt: row.created_at }
    : null;
  req.tier = tierFor(req.user?.tier);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "auth_required", message: "Giriş yapmanız gerekiyor" });
    return;
  }
  next();
}

function requireFeature(feature, message) {
  return (req, res, next) => {
    if (!req.tier[feature]) {
      res.status(403).json({
        error: "upgrade_required",
        message,
        tier: req.tier.key,
      });
      return;
    }
    next();
  };
}

function publicUser(user) {
  if (!user) return null;
  const tier = tierFor(user.tier);
  return {
    email: user.email,
    tier: tier.key,
    tierName: tier.name,
    createdAt: user.createdAt ?? user.created_at ?? null,
    limits: {
      maxResults: tier.maxResults,
      favoriteLimit: tier.favoriteLimit,
      liveEmptyFilter: tier.liveEmptyFilter,
      advancedSort: tier.advancedSort,
      export: tier.export,
      maxPriceFilter: tier.maxPriceFilter,
      openNowFilter: tier.openNowFilter,
    },
  };
}

function setTier(userId, tierKey) {
  if (!TIERS[tierKey]) return null;
  updateUserTier.run({ id: userId, tier: tierKey, tier_changed_at: Date.now() });
  return selectUserById.get(userId);
}

module.exports = {
  COOKIE_NAME,
  TIERS,
  GUEST_TIER,
  tierFor,
  publicTiers,
  publicUser,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  validCredentials,
  parseCookies,
  createUser,
  createSession,
  destroySession,
  attachUser,
  requireAuth,
  requireFeature,
  setTier,
  selectUserByEmail,
  selectUserById,
};
