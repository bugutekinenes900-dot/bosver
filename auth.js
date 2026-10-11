const crypto = require("node:crypto");
const {
  insertUser,
  selectUserByEmail,
  selectUserById,
  updateUserTier,
  updateUserQuota,
  insertSession,
  selectSession,
  deleteSession,
  deleteExpiredSessions,
} = require("./db");

const COOKIE_NAME = "bosver_session";
const QUOTA_COOKIE = "bosver_quota";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const KEY_LENGTH = 64;
const QUOTA_WINDOW_MS = 48 * 60 * 60 * 1000;
const QUOTA_DIRECT = 2;
const QUOTA_WITH_AD = 4;
const AD_WAIT_MS = 8000;
const QUOTA_SECRET = process.env.QUOTA_SECRET || "bosver-quota-v1";

const MAP_FEATURES = {
  maxResults: 500,
  favoriteLimit: 500,
  liveEmptyFilter: true,
  advancedSort: true,
  export: true,
  maxPriceFilter: true,
  openNowFilter: true,
};

const TIERS = {
  free: {
    key: "free",
    name: "Ücretsiz",
    priceLabel: "₺0",
    periodLabel: "48 saatte 2 arama",
    ...MAP_FEATURES,
    recommended: false,
    hook: "İki arama Pro ile aynı haritayı açar.",
    perks: [
      "48 saatte 2 arama, Pro ile aynı süzgeçler",
      "Canlı boş yer, fiyat tavanı, açık olanlar",
      "En boş / en ucuz sıralama ve 500 sonuç",
      "3. ve 4. arama reklam bitince açılır",
      "5. arama için Pro gerekir",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceLabel: "₺99",
    periodLabel: "ay",
    ...MAP_FEATURES,
    recommended: true,
    hook: "Arama sınırı ve reklam yok.",
    perks: [
      "Ücretsizdeki haritanın tamamı, hak sayacı yok",
      "500 favori ve boş yer uyarısı",
      "İSPARK canlı boş yer + sadece müsait olanlar",
      "En boş / en ucuz sıralama",
      "₺150 tavan ve şu an açık olanlar",
      "CSV / GeoJSON dışa aktarma",
    ],
  },
};

const GUEST_TIER = TIERS.free;

function tierFor(key) {
  if (key === "plus" || key === "pro") return TIERS.pro;
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
    ? {
        id: row.id,
        email: row.email,
        tier: row.tier,
        createdAt: row.created_at,
        quota_start: row.quota_start || 0,
        quota_used: row.quota_used || 0,
      }
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

function signQuota(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", QUOTA_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsignQuota(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac("sha256", QUOTA_SECRET).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function freshQuota(now = Date.now()) {
  return { start: now, used: 0, credit: 0, adStarted: 0 };
}

function activeQuota(raw, now = Date.now()) {
  if (!raw || !Number.isFinite(Number(raw.start))) return null;
  const start = Number(raw.start);
  if (now - start >= QUOTA_WINDOW_MS) return null;
  return {
    start,
    used: Math.max(0, Number(raw.used) || 0),
    credit: Math.max(0, Number(raw.credit) || 0),
    adStarted: Math.max(0, Number(raw.adStarted) || 0),
  };
}

function loadQuota(req) {
  const now = Date.now();
  const cookieRaw = unsignQuota(parseCookies(req.headers.cookie)[QUOTA_COOKIE]);
  const cookieQuota = activeQuota(cookieRaw, now);
  const dbQuota = req.user
    ? activeQuota({ start: req.user.quota_start, used: req.user.quota_used, credit: 0, adStarted: 0 }, now)
    : null;
  if (!cookieQuota && !dbQuota) return null;
  if (!cookieQuota) return dbQuota;
  if (!dbQuota) return cookieQuota;
  const base = cookieQuota.used >= dbQuota.used ? cookieQuota : { ...dbQuota, credit: cookieQuota.credit, adStarted: cookieQuota.adStarted };
  base.credit = Math.max(cookieQuota.credit, base.credit || 0);
  base.adStarted = cookieQuota.adStarted || 0;
  return base;
}

function saveQuota(req, res, quota) {
  res.cookie(QUOTA_COOKIE, signQuota(quota), {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(process.env.VERCEL),
    maxAge: QUOTA_WINDOW_MS,
    path: "/",
  });
  if (!req.user) return;
  updateUserQuota.run({ id: req.user.id, quota_start: quota.start, quota_used: quota.used });
  req.user.quota_start = quota.start;
  req.user.quota_used = quota.used;
}

function adsenseClient() {
  return process.env.ADSENSE_CLIENT || null;
}

function prepareSearch(req) {
  if (req.tier.key === "pro") return { ok: true, skip: true };
  const quota = loadQuota(req) || freshQuota();
  if (quota.used < QUOTA_DIRECT) return { ok: true, quota, consumeCredit: false };
  if (quota.used < QUOTA_WITH_AD) {
    if (quota.credit > 0) return { ok: true, quota, consumeCredit: true };
    return {
      ok: false,
      status: 403,
      body: {
        error: "ad_required",
        message: "Bu arama için reklamın bitmesi gerekiyor",
        waitMs: AD_WAIT_MS,
        adsenseClient: adsenseClient(),
      },
    };
  }
  return {
    ok: false,
    status: 403,
    body: {
      error: "pro_required",
      message: "48 saatte 4 aramadan fazlası Pro üyelik ister",
    },
  };
}

function commitSearch(req, res, decision) {
  if (!decision || decision.skip) return null;
  const quota = {
    ...decision.quota,
    used: decision.quota.used + 1,
    credit: decision.consumeCredit ? 0 : decision.quota.credit,
    adStarted: 0,
  };
  saveQuota(req, res, quota);
  return quota;
}

function beginAd(req, res) {
  if (req.tier.key === "pro") {
    return { ok: false, status: 400, body: { error: "not_needed", message: "Pro üyelikte reklam yok" } };
  }
  const quota = loadQuota(req) || freshQuota();
  if (quota.used < QUOTA_DIRECT || quota.used >= QUOTA_WITH_AD) {
    return { ok: false, status: 400, body: { error: "ad_not_available", message: "Şu an reklamla arama açılamaz" } };
  }
  quota.adStarted = Date.now();
  saveQuota(req, res, quota);
  return { ok: true };
}

function finishAd(req, res) {
  if (req.tier.key === "pro") {
    return { ok: false, status: 400, body: { error: "not_needed", message: "Pro üyelikte reklam yok" } };
  }
  const quota = loadQuota(req);
  if (!quota?.adStarted) {
    return { ok: false, status: 400, body: { error: "ad_not_started", message: "Reklam başlatılmadı" } };
  }
  const waited = Date.now() - quota.adStarted;
  if (waited < AD_WAIT_MS) {
    return {
      ok: false,
      status: 400,
      body: { error: "too_soon", message: "Reklam henüz bitmedi", waitMs: AD_WAIT_MS - waited },
    };
  }
  quota.credit = 1;
  quota.adStarted = 0;
  saveQuota(req, res, quota);
  return { ok: true };
}

function publicQuota(req, saved) {
  if (req.tier.key === "pro") return { unlimited: true };
  const quota = saved || loadQuota(req) || freshQuota();
  return {
    unlimited: false,
    used: quota.used,
    directLeft: Math.max(0, QUOTA_DIRECT - quota.used),
    resetsAt: quota.start + QUOTA_WINDOW_MS,
  };
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
  prepareSearch,
  commitSearch,
  beginAd,
  finishAd,
  publicQuota,
  AD_WAIT_MS,
  selectUserByEmail,
  selectUserById,
};
