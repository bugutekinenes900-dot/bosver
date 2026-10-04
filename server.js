const os = require("os");
const path = require("path");
const express = require("express");
const { lotsForBbox, lotsForQuery, getLot, MAX_LOTS } = require("./osm");
const ispark = require("./ispark");
const izmir = require("./izmir");
const auth = require("./auth");
const {
  insertFavorite,
  selectFavorites,
  countFavorites,
  deleteFavorite,
  insertParkingSession,
  selectActiveParkingSession,
  selectParkingSessions,
  selectParkingSession,
  finishParkingSession,
} = require("./db");
const { estimateSessionFee, durationLabel } = require("./pricing");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(auth.attachUser);

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function originFromQuery(query) {
  const lat = num(query.lat);
  const lng = num(query.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function sourceOf(lotId) {
  if (lotId.startsWith("ispark_")) return "ispark";
  if (lotId.startsWith("izmir_")) return "izmir";
  return "osm";
}

function bboxFromQuery(query) {
  const south = num(query.south);
  const west = num(query.west);
  const north = num(query.north);
  const east = num(query.east);
  if ([south, west, north, east].some((v) => v == null)) return null;
  if (south >= north || west >= east) return null;
  return { south, west, north, east };
}

function lotOptions(req) {
  const tier = req.tier;
  const requestedSort = String(req.query.sort || "distance");
  const requestedEmpty = req.query.empty === "1" || req.query.empty === "true";
  const requestedOpen = req.query.open === "1" || req.query.open === "true";
  const requestedMax = num(req.query.maxPrice);
  return {
    origin: originFromQuery(req.query),
    type: req.query.type,
    free: req.query.free === "1" || req.query.free === "true",
    onlyEmpty: requestedEmpty && tier.liveEmptyFilter,
    openNow: requestedOpen && tier.openNowFilter,
    maxPrice: requestedMax != null && tier.maxPriceFilter ? requestedMax : null,
    sort: tier.advancedSort ? requestedSort : "distance",
    limit: tier.maxResults,
    blocked: {
      onlyEmpty: requestedEmpty && !tier.liveEmptyFilter,
      sort: requestedSort !== "distance" && !tier.advancedSort,
      openNow: requestedOpen && !tier.openNowFilter,
      maxPrice: requestedMax != null && !tier.maxPriceFilter,
    },
  };
}

function tierMeta(req, result, options) {
  const tierLimited = result.limited && req.tier.maxResults < MAX_LOTS;
  return {
    tier: req.tier.key,
    tierName: req.tier.name,
    total: result.total,
    shown: result.lots.length,
    limited: tierLimited,
    hardCapped: result.limited && !tierLimited,
    maxResults: req.tier.maxResults,
    blockedFeatures: options.blocked,
    upgradeHint: tierLimited
      ? req.tier.key === "free"
        ? `${req.tier.name} üyelikte en yakın ${req.tier.maxResults} sonuç gösterilir. Plus ile 200, Pro ile 500 sonuç görün.`
        : `${req.tier.name} üyelikte en yakın ${req.tier.maxResults} sonuç gösterilir. Pro ile 500 sonuca çıkın.`
      : null,
  };
}

async function resolveLots(req) {
  const options = lotOptions(req);
  const q = (req.query.q || "").trim();
  if (q) {
    const result = await lotsForQuery(q, options);
    return { result, options, payload: { center: result.center, label: result.label } };
  }
  const bbox = bboxFromQuery(req.query);
  if (!bbox) {
    const err = new Error("south, west, north, east veya q gerekli");
    err.code = "bbox_required";
    err.status = 400;
    throw err;
  }
  const result = await lotsForBbox(bbox, options);
  return { result, options, payload: { center: null, bbox } };
}

app.get("/api/lots", async (req, res) => {
  try {
    const { result, options, payload } = await resolveLots(req);
    res.json({ lots: result.lots, ...payload, ...tierMeta(req, result, options) });
  } catch (err) {
    const status =
      err.status || (err.code === "bbox_too_large" ? 400 : 502);
    res.status(status).json({
      error: err.code || "upstream",
      message: err.message || "Otoparklar alınamadı",
    });
  }
});

app.get("/api/lots/:id", async (req, res) => {
  try {
    const lot = await getLot(req.params.id, originFromQuery(req.query));
    if (!lot) {
      res.status(404).json({ error: "Otopark bulunamadı" });
      return;
    }
    res.json(lot);
  } catch (err) {
    res.status(502).json({ error: "upstream", message: err.message });
  }
});

app.get("/api/sources", (req, res) => {
  res.json({
    sources: [
      {
        key: "ispark",
        label: "İSPARK (İBB Açık Veri)",
        live: true,
        note: "İstanbul otoparkları: gerçek tarife ve anlık boş yer sayısı",
        lots: ispark.status.lots,
        lastOk: ispark.status.lastOk || null,
        lastError: ispark.status.lastError,
      },
      {
        key: "izmir",
        label: "İzmir Açık Veri (İZUM / İZELMAN)",
        live: true,
        note: "İzmir otoparkları: anlık boş yer sayısı ve İZELMAN ücret listesinden tarife",
        lots: izmir.status.lots,
        lastOk: izmir.status.lastOk || null,
        lastError: izmir.status.lastError,
      },
      {
        key: "ankara",
        label: "Ankara",
        live: false,
        note: "Ankara Büyükşehir'in açık veri sayfasında otopark veri seti / API yayınlanmıyor (acikveri.ankara.bel.tr yanıt vermiyor). Ankara'da yalnızca OpenStreetMap kayıtları gösterilir, uydurma doluluk üretilmez.",
      },
      {
        key: "osm",
        label: "OpenStreetMap",
        live: false,
        note: "Fiyat yalnızca charge/fee etiketi girilmişse gösterilir, anlık doluluk yoktur",
      },
    ],
  });
});

app.get("/api/tiers", (req, res) => {
  res.json({ tiers: auth.publicTiers(), current: req.tier.key });
});

app.post("/api/auth/register", (req, res) => {
  const email = auth.normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const problem = auth.validCredentials(email, password);
  if (problem) {
    res.status(400).json({ error: "invalid_input", message: problem });
    return;
  }
  if (auth.selectUserByEmail.get(email)) {
    res.status(409).json({ error: "email_taken", message: "Bu e-posta zaten kayıtlı" });
    return;
  }
  const user = auth.createUser(email, password);
  auth.createSession(res, user.id);
  res.status(201).json({ user: auth.publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const email = auth.normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const user = auth.selectUserByEmail.get(email);
  if (!user || !auth.verifyPassword(password, user.password_hash, user.password_salt)) {
    res.status(401).json({ error: "bad_credentials", message: "E-posta veya parola hatalı" });
    return;
  }
  auth.createSession(res, user.id);
  res.json({ user: auth.publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: auth.publicUser(req.user), tiers: auth.publicTiers() });
});

app.post("/api/auth/upgrade", auth.requireAuth, (req, res) => {
  const tierKey = String(req.body?.tier || "");
  if (!auth.TIERS[tierKey]) {
    res.status(400).json({ error: "invalid_tier", message: "Geçersiz üyelik kademesi" });
    return;
  }
  const user = auth.setTier(req.user.id, tierKey);
  res.json({
    user: auth.publicUser(user),
    demo: true,
    message: `Demo: ${auth.TIERS[tierKey].name} kademesine geçildi, ödeme alınmadı`,
  });
});

const favoritesGate = auth.requireFeature(
  "favoriteLimit",
  "Favori kaydetmek için Plus üyelik gerekiyor"
);

app.get("/api/favorites", auth.requireAuth, favoritesGate, (req, res) => {
  const rows = selectFavorites.all(req.user.id);
  res.json({
    favorites: rows.map((row) => ({
      id: row.lot_id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      source: row.source,
      createdAt: row.created_at,
    })),
    limit: req.tier.favoriteLimit,
  });
});

app.post("/api/favorites", auth.requireAuth, favoritesGate, (req, res) => {
  const lotId = String(req.body?.id || "").trim();
  if (!lotId) {
    res.status(400).json({ error: "invalid_input", message: "Otopark kimliği gerekli" });
    return;
  }
  const existing = selectFavorites.all(req.user.id).some((row) => row.lot_id === lotId);
  if (!existing && countFavorites.get(req.user.id).n >= req.tier.favoriteLimit) {
    res.status(403).json({
      error: "limit_reached",
      message: `${req.tier.name} üyelikte en fazla ${req.tier.favoriteLimit} favori kaydedebilirsiniz`,
    });
    return;
  }
  insertFavorite.run({
    user_id: req.user.id,
    lot_id: lotId,
    name: String(req.body?.name || ""),
    lat: num(req.body?.lat),
    lng: num(req.body?.lng),
    source: sourceOf(lotId),
    created_at: Date.now(),
  });
  res.status(201).json({ ok: true });
});

app.delete("/api/favorites/:id", auth.requireAuth, favoritesGate, (req, res) => {
  deleteFavorite.run(req.user.id, req.params.id);
  res.json({ ok: true });
});

app.get("/api/favorites/watch", auth.requireAuth, favoritesGate, async (req, res) => {
  const rows = selectFavorites.all(req.user.id).slice(0, req.tier.favoriteLimit);
  const parkIds = rows
    .filter((row) => row.lot_id.startsWith("ispark_"))
    .map((row) => Number(row.lot_id.slice("ispark_".length)))
    .filter(Number.isFinite);
  const izmirIds = rows
    .filter((row) => row.lot_id.startsWith("izmir_"))
    .map((row) => row.lot_id.slice("izmir_".length));

  let live = new Map();
  try {
    const [isparkLive, izmirLive] = await Promise.all([
      ispark.liveStatuses(parkIds),
      izmir.liveStatuses(izmirIds),
    ]);
    live = new Map([...isparkLive, ...izmirLive]);
  } catch (err) {
    res.status(502).json({ error: "upstream", message: err.message });
    return;
  }

  res.json({
    checkedAt: Date.now(),
    watched: rows.map((row) => {
      const status = live.get(row.lot_id) || null;
      return {
        id: row.lot_id,
        name: status?.name || row.name || row.lot_id,
        live: Boolean(status),
        emptySpots: status?.emptySpots ?? null,
        totalSpots: status?.totalSpots ?? null,
        updatedAt: status?.updatedAt ?? null,
        note: status
          ? null
          : "Anlık doluluk yalnızca İSPARK ve İzmir açık veri otoparklarında var",
      };
    }),
  });
});

function sessionPayload(row) {
  const end = row.ended_at ?? Date.now();
  return {
    id: row.id,
    lotId: row.lot_id,
    lotName: row.lot_name,
    source: row.source,
    lat: row.lat,
    lng: row.lng,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    minutes: Math.max(0, Math.round((end - row.started_at) / 60000)),
    durationLabel: durationLabel((end - row.started_at) / 60000),
    estimatedFee: row.estimated_fee,
    feeLabel: row.fee_label,
    feeNote: row.fee_note,
  };
}

app.get("/api/sessions", auth.requireAuth, (req, res) => {
  const rows = selectParkingSessions.all(req.user.id);
  const active = rows.find((row) => row.ended_at == null) || null;
  res.json({
    sessions: rows.map(sessionPayload),
    active: active ? sessionPayload(active) : null,
  });
});

app.post("/api/sessions", auth.requireAuth, (req, res) => {
  const lotId = String(req.body?.id || "").trim();
  if (!lotId) {
    res.status(400).json({ error: "invalid_input", message: "Otopark kimliği gerekli" });
    return;
  }
  const active = selectActiveParkingSession.get(req.user.id);
  if (active) {
    res.status(409).json({
      error: "session_active",
      message: `Zaten ${active.lot_name || "bir otoparkta"} park halindesiniz, önce çıkış yapın`,
      active: sessionPayload(active),
    });
    return;
  }
  const info = insertParkingSession.run({
    user_id: req.user.id,
    lot_id: lotId,
    lot_name: String(req.body?.name || ""),
    source: sourceOf(lotId),
    lat: num(req.body?.lat),
    lng: num(req.body?.lng),
    started_at: Date.now(),
  });
  res.status(201).json({ session: sessionPayload(selectParkingSession.get(info.lastInsertRowid)) });
});

app.post("/api/sessions/end", auth.requireAuth, async (req, res) => {
  const active = selectActiveParkingSession.get(req.user.id);
  if (!active) {
    res.status(404).json({ error: "no_session", message: "Aktif park oturumu yok" });
    return;
  }
  const endedAt = Date.now();
  const minutes = (endedAt - active.started_at) / 60000;

  let lot = null;
  try {
    lot = await getLot(active.lot_id, null);
  } catch {
    lot = null;
  }
  const fee = lot
    ? estimateSessionFee(lot, minutes)
    : {
        amount: null,
        label: "Tahmin edilemedi",
        note: "Otopark kaydı kaynaktan okunamadı",
      };

  finishParkingSession.run({
    id: active.id,
    user_id: req.user.id,
    ended_at: endedAt,
    estimated_fee: fee.amount,
    fee_label: fee.label,
    fee_note: fee.note,
  });
  res.json({ session: sessionPayload(selectParkingSession.get(active.id)) });
});

function toCsv(lots) {
  const header = [
    "id",
    "isim",
    "kaynak",
    "enlem",
    "boylam",
    "tip",
    "fiyat",
    "saatlik_tl",
    "bos_yer",
    "kapasite",
    "adres",
  ];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = lots.map((lot) =>
    [
      lot.id,
      lot.name,
      lot.sourceLabel,
      lot.lat,
      lot.lng,
      lot.type,
      lot.priceLabel,
      lot.pricePerHour ?? "",
      lot.emptySpots ?? "",
      lot.totalSpots ?? "",
      lot.address,
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\r\n");
}

function toGeoJson(lots) {
  return {
    type: "FeatureCollection",
    features: lots.map((lot) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lot.lng, lot.lat] },
      properties: {
        id: lot.id,
        name: lot.name,
        source: lot.source,
        sourceLabel: lot.sourceLabel,
        priceLabel: lot.priceLabel,
        pricePerHour: lot.pricePerHour,
        emptySpots: lot.emptySpots,
        totalSpots: lot.totalSpots,
        liveOccupancy: lot.liveOccupancy,
        address: lot.address,
      },
    })),
  };
}

app.get(
  "/api/export",
  auth.requireAuth,
  auth.requireFeature("export", "Dışa aktarma Pro üyelikte açılır"),
  async (req, res) => {
    try {
      const { result } = await resolveLots(req);
      const format = String(req.query.format || "csv").toLowerCase();
      if (format === "geojson") {
        res.setHeader("Content-Disposition", 'attachment; filename="bosver-otoparklar.geojson"');
        res.json(toGeoJson(result.lots));
        return;
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="bosver-otoparklar.csv"');
      res.send("\uFEFF" + toCsv(result.lots));
    } catch (err) {
      res.status(err.status || 502).json({
        error: err.code || "upstream",
        message: err.message || "Dışa aktarılamadı",
      });
    }
  }
);

function listenUrls(port) {
  const urls = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      const family = net.family === 4 || net.family === "IPv4";
      if (family && !net.internal) urls.push(`http://${net.address}:${port}`);
    }
  }
  if (!urls.length) urls.push(`http://127.0.0.1:${port}`);
  return [...new Set(urls)];
}

app.listen(PORT, "0.0.0.0", () => {
  const urls = listenUrls(PORT);
  console.log(`BoŞvEr hazır — bu adresten aç:`);
  for (const url of urls) console.log(`  ${url}`);
  ispark.warmTariffs();
  izmir.warmUp();
});
