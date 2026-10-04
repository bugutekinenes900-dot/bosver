const ADANA = { lat: 36.995, lng: 35.324 };
const MIN_ZOOM = 13;

const SORT_MODES = [
  { key: "distance", label: "En yakın" },
  { key: "empty", label: "En boş" },
  { key: "price", label: "En ucuz" },
];

const state = {
  lots: [],
  filter: "all",
  onlyEmpty: false,
  maxPrice: null,
  openNow: false,
  sort: "distance",
  query: "",
  origin: { ...ADANA },
  hasGps: false,
  selectedId: null,
  map: null,
  markersLayer: null,
  userMarker: null,
  moveTimer: null,
  skipMoveFetch: false,
  reqSeq: 0,
  user: null,
  tiers: [],
  favorites: new Map(),
  authMode: "login",
  lastMeta: null,
  sessions: [],
  activeSession: null,
  alertsOn: false,
  alertTimer: null,
  alertCheckedAt: null,
  watch: new Map(),
  watchPrev: new Map(),
};

const ALERT_POLL_MS = 2 * 60 * 1000;
const ALERT_STORAGE_KEY = "bosver_alerts";

function limits() {
  return (
    state.user?.limits || {
      maxResults: 20,
      favoriteLimit: 0,
      liveEmptyFilter: false,
      advancedSort: false,
      export: false,
      maxPriceFilter: false,
      openNowFilter: false,
    }
  );
}

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showGpsMessage(text, isError) {
  const bar = el("gps-message");
  if (!bar) return;
  bar.textContent = text;
  bar.classList.remove("hidden");
  bar.classList.toggle("bg-red-100", isError);
  bar.classList.toggle("text-red-800", isError);
  bar.classList.toggle("bg-surface", !isError);
  bar.classList.toggle("text-on-surface", !isError);
}

function hideGpsMessage() {
  el("gps-message")?.classList.add("hidden");
}

function currentBbox() {
  const b = state.map.getBounds();
  return {
    south: b.getSouth(),
    west: b.getWest(),
    north: b.getNorth(),
    east: b.getEast(),
  };
}

function filterParams() {
  const params = new URLSearchParams();
  if (state.filter === "indoor" || state.filter === "outdoor") {
    params.set("type", state.filter);
  }
  if (state.filter === "free") params.set("free", "1");
  if (state.onlyEmpty) params.set("empty", "1");
  if (state.openNow) params.set("open", "1");
  if (state.maxPrice != null) params.set("maxPrice", String(state.maxPrice));
  if (state.sort !== "distance") params.set("sort", state.sort);
  params.set("lat", String(state.origin.lat));
  params.set("lng", String(state.origin.lng));
  return params;
}

function bboxParams(params) {
  const bbox = currentBbox();
  params.set("south", String(bbox.south));
  params.set("west", String(bbox.west));
  params.set("north", String(bbox.north));
  params.set("east", String(bbox.east));
  return params;
}

async function fetchLotsByBbox() {
  if (state.map.getZoom() < MIN_ZOOM) {
    const err = new Error("Otoparkları görmek için haritayı yaklaştırın");
    err.code = "bbox_too_large";
    throw err;
  }
  const params = bboxParams(filterParams());
  const res = await fetch(`/api/lots?${params}`);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || "Yüklenemedi"), { code: data.error });
  return data;
}

async function fetchLotsByQuery(q) {
  const params = filterParams();
  params.set("q", q);
  const res = await fetch(`/api/lots?${params}`);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || "Arama başarısız"), { code: data.error });
  return data;
}

function pinHtml(lot) {
  return `
    <div class="flex flex-col items-center">
      <div class="w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center border-2 border-white shadow-lg font-bold">P</div>
      <div class="bg-white px-2 py-0.5 rounded shadow text-[11px] whitespace-nowrap mt-1 max-w-[140px] overflow-hidden text-ellipsis">
        ${escapeHtml(lot.name)}
      </div>
    </div>`;
}

function renderMarkers() {
  if (!state.markersLayer) return;
  state.markersLayer.clearLayers();
  const markers = state.lots.map((lot) => {
    const icon = L.divIcon({
      className: "bg-transparent border-0",
      html: pinHtml(lot),
      iconSize: [160, 72],
      iconAnchor: [80, 36],
    });
    const marker = L.marker([lot.lat, lot.lng], { icon });
    marker.on("click", () => {
      state.selectedId = lot.id;
      updateFloatingCard(lot);
    });
    return marker;
  });
  if (state.markersLayer.addLayers) {
    state.markersLayer.addLayers(markers);
    return;
  }
  markers.forEach((marker) => state.markersLayer.addLayer(marker));
}

function updateFloatingCard(lot) {
  const card = el("floating-card");
  if (!lot) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  card.dataset.id = String(lot.id);
  el("floating-card-title").textContent = lot.name;
  el("floating-card-capacity").textContent = lot.capacityLabel;
  el("floating-card-distance").textContent = lot.distanceLabel
    ? `• ${lot.distanceLabel}`
    : "";
  el("floating-card-price").textContent = lot.priceLabel;
  el("floating-card-source").textContent = lot.liveOccupancy
    ? `• ${lot.sourceLabel} canlı`
    : `• ${lot.sourceLabel}`;
}

function sourceChip(lot) {
  const tone = lot.liveOccupancy
    ? "bg-green-100 text-green-800"
    : "bg-surface-variant text-on-surface-variant";
  return `<span class="${tone} px-2 py-0.5 rounded-full font-label-md">${escapeHtml(lot.sourceLabel)}</span>`;
}

function renderTariff(lot) {
  const section = el("detail-tariff-section");
  if (!lot.priceBands || !lot.priceBands.length) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  el("detail-tariff-title").textContent = `${sourceName(lot.source).toLocaleUpperCase("tr-TR")} TARİFESİ`;
  el("detail-tariff").innerHTML = lot.priceBands
    .map(
      (band) =>
        `<div class="flex justify-between px-md py-2 border-b border-outline-variant last:border-b-0 font-body-md">
          <span class="text-on-surface-variant">${escapeHtml(band.label)}</span>
          <span class="font-bold text-on-surface">${escapeHtml(band.amountLabel)}</span>
        </div>`
    )
    .join("");
  const monthly = el("detail-monthly");
  monthly.classList.toggle("hidden", !lot.monthlyFeeLabel);
  if (lot.monthlyFeeLabel) monthly.textContent = `Aylık abonelik: ${lot.monthlyFeeLabel}`;
}

function showDetailView(lot) {
  state.selectedId = lot.id;
  el("detail-title").textContent = lot.name;
  el("detail-capacity").textContent = lot.capacityLabel;
  el("detail-capacity-note").textContent = lot.liveOccupancy
    ? `Anlık boş yer (${lot.sourceLabel})`
    : "Kapasite (OSM kaydı)";
  el("detail-distance").textContent = lot.distanceLabel || "—";
  el("detail-price").textContent = lot.priceLabel;
  el("detail-source").textContent = `Kaynak: ${lot.sourceLabel}`;
  el("detail-address").textContent = lot.address || "OpenStreetMap";

  const note = el("detail-price-note");
  const notes = [lot.priceNote, lot.occupancyNote].filter(Boolean).join(" · ");
  note.classList.toggle("hidden", !notes);
  note.textContent = notes;

  el("detail-available-badge").classList.toggle("hidden", lot.empty !== true);
  el("detail-full-badge").classList.toggle("hidden", lot.empty !== false);
  el("detail-unknown-badge").classList.toggle("hidden", lot.liveOccupancy === true);
  el("detail-live-badge").classList.toggle("hidden", !lot.liveOccupancy);

  renderTariff(lot);
  renderFavoriteButton(lot);
  renderParkButton();

  el("detail-features").innerHTML = lot.features
    .map(
      (feature) =>
        `<div class="bg-surface-variant text-on-surface-variant px-sm py-xs rounded-full font-body-md">${escapeHtml(feature)}</div>`
    )
    .join("");
  showView("view-detail");
}

function renderSearchResults(lots) {
  const list = el("search-results-list");
  list.innerHTML = "";
  if (!lots.length) {
    list.innerHTML =
      '<p class="text-on-surface-variant text-center py-8">Bu bölgede otopark bulunamadı.</p>';
    return;
  }
  if (state.lastMeta?.limited) {
    const notice = document.createElement("div");
    notice.className =
      "rounded-xl bg-[#1a237e] text-white px-4 py-3 font-body-md cursor-pointer";
    notice.textContent = `${state.lastMeta.total} sonuçtan ${state.lastMeta.maxResults} tanesi listelendi. Tümü için Plus'a geçin.`;
    notice.onclick = () => showView("view-membership");
    list.appendChild(notice);
  }
  lots.forEach((lot) => {
    const div = document.createElement("div");
    div.className =
      "bg-surface border border-outline-variant rounded-xl p-4 flex justify-between items-center cursor-pointer hover:bg-surface-container-low shadow-sm";
    div.onclick = () => {
      flyToLot(lot);
      updateFloatingCard(lot);
      showDetailView(lot);
    };
    div.innerHTML = `
      <div class="flex-1 min-w-0">
        <h4 class="font-headline-md text-on-surface mb-1">${escapeHtml(lot.name)}</h4>
        <p class="font-body-md text-on-surface-variant mb-1">${escapeHtml(lot.address || "OpenStreetMap")}</p>
        <div class="flex items-center gap-2 text-on-surface-variant font-body-md">
          <span>${escapeHtml(lot.distanceLabel || "—")}</span>
          <span>•</span>
          <span class="font-bold text-[#1a237e]">${escapeHtml(lot.priceLabel)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2 mt-1">
          <span class="font-label-md ${lot.liveOccupancy ? "text-green-800 font-bold" : "text-on-surface-variant"}">${escapeHtml(lot.capacityLabel)}</span>
          ${sourceChip(lot)}
        </div>
      </div>
      <span class="material-symbols-outlined text-[#1a237e]">chevron_right</span>`;
    list.appendChild(div);
  });
}

function applyMeta(meta) {
  state.lastMeta = meta;
  const banner = el("limit-banner");
  if (!banner) return;
  if (!meta || !meta.limited) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  banner.textContent = `${meta.total} otoparktan ${meta.maxResults} tanesi gösteriliyor — Plus ile tümünü görün.`;
  banner.onclick = () => showView("view-membership");
  banner.classList.add("cursor-pointer");
}

function flyToLot(lot) {
  state.skipMoveFetch = true;
  state.map.setView([lot.lat, lot.lng], Math.max(state.map.getZoom(), 16));
  setTimeout(() => {
    state.skipMoveFetch = false;
  }, 500);
}

function setOverlay(visible, text) {
  const overlay = el("map-loading-overlay");
  if (text) el("map-loading-text").textContent = text;
  overlay.classList.toggle("view-hidden", !visible);
  overlay.classList.toggle("view-visible", visible);
}

async function refreshLots() {
  const seq = ++state.reqSeq;
  setOverlay(true, "Otoparklar yükleniyor...");
  try {
    const data = await fetchLotsByBbox();
    if (seq !== state.reqSeq) return;
    state.lots = data.lots || [];
    applyMeta(data);
    renderMarkers();
    const selected =
      state.lots.find((lot) => lot.id === state.selectedId) || state.lots[0] || null;
    updateFloatingCard(selected);
    hideGpsMessage();
  } catch (err) {
    if (seq !== state.reqSeq) return;
    showGpsMessage(err.message, true);
    if (err.code === "bbox_too_large") {
      state.lots = [];
      applyMeta(null);
      renderMarkers();
      updateFloatingCard(null);
    }
  } finally {
    if (seq === state.reqSeq) setOverlay(false, "Aranıyor...");
  }
}

function onMapMoved() {
  if (state.skipMoveFetch) return;
  clearTimeout(state.moveTimer);
  state.moveTimer = setTimeout(() => {
    refreshLots();
  }, 400);
}

async function performSearch() {
  const input = el("search-input-main");
  state.query = input.value.trim();
  el("map-search-input").value = state.query;
  if (!state.query) return;

  el("search-initial-state").classList.add("hidden");
  el("search-results-state").classList.remove("hidden");
  el("search-results-state").classList.add("flex");
  el("search-loading").classList.remove("hidden");
  el("search-loading").classList.add("flex");
  el("search-results-list").innerHTML = "";
  setOverlay(true, `${state.query} aranıyor...`);

  const seq = ++state.reqSeq;
  try {
    const data = await fetchLotsByQuery(state.query);
    if (seq !== state.reqSeq) return;
    state.lots = data.lots || [];
    applyMeta(data);
    if (data.center) {
      state.skipMoveFetch = true;
      state.map.setView([data.center.lat, data.center.lng], 14);
      setTimeout(() => {
        state.skipMoveFetch = false;
      }, 600);
    }
    renderMarkers();
    updateFloatingCard(state.lots[0] || null);
    el("search-loading").classList.add("hidden");
    el("search-loading").classList.remove("flex");
    renderSearchResults(state.lots);
  } catch (err) {
    if (seq !== state.reqSeq) return;
    el("search-loading").classList.add("hidden");
    el("search-loading").classList.remove("flex");
    el("search-results-list").innerHTML = `<p class="text-error text-center py-8">${escapeHtml(err.message)}</p>`;
  } finally {
    if (seq === state.reqSeq) setOverlay(false);
  }
}

function searchCity(city) {
  el("search-input-main").value = city;
  el("map-search-input").value = city;
  performSearch();
}

function toggleFilter(filterType) {
  const btn = el("filter-" + filterType);
  const wasActive = btn.classList.contains("bg-primary");
  document.querySelectorAll(".filter-btn").forEach((b) => {
    b.classList.remove("bg-primary", "text-on-primary", "shadow-md");
    b.classList.add("bg-surface", "text-on-surface-variant");
  });
  state.filter = wasActive ? "all" : filterType;
  if (!wasActive) {
    btn.classList.add("bg-primary", "text-on-primary", "shadow-md");
    btn.classList.remove("bg-surface", "text-on-surface-variant");
  }
  refreshLots();
}

function setChipActive(node, active) {
  node.classList.toggle("bg-primary", active);
  node.classList.toggle("text-on-primary", active);
  node.classList.toggle("shadow-md", active);
  node.classList.toggle("bg-surface", !active);
  node.classList.toggle("text-on-surface-variant", !active);
}

function renderFilterLocks() {
  const { liveEmptyFilter, advancedSort, export: canExport, maxPriceFilter, openNowFilter } =
    limits();
  el("filter-empty-lock").classList.toggle("hidden", liveEmptyFilter);
  setChipActive(el("filter-empty"), state.onlyEmpty);
  document.querySelectorAll(".sort-chip").forEach((chip) => {
    const key = chip.getAttribute("data-sort");
    const lock = chip.querySelector(".sort-lock");
    const needsPro = key !== "distance";
    if (lock) lock.classList.toggle("hidden", !needsPro || advancedSort);
    setChipActive(chip, state.sort === key);
  });
  document.querySelectorAll(".export-chip .material-symbols-outlined").forEach((lock) => {
    lock.classList.toggle("hidden", canExport);
  });
  el("filter-max-price-lock").classList.toggle("hidden", maxPriceFilter);
  el("filter-open-now-lock").classList.toggle("hidden", openNowFilter);
  setChipActive(el("filter-max-price"), state.maxPrice != null);
  setChipActive(el("filter-open-now"), state.openNow);
}

function toggleOnlyEmpty() {
  if (!limits().liveEmptyFilter) {
    showView("view-membership");
    return;
  }
  state.onlyEmpty = !state.onlyEmpty;
  renderFilterLocks();
  refreshLots();
}

function toggleMaxPrice() {
  if (!limits().maxPriceFilter) {
    showView("view-membership");
    return;
  }
  state.maxPrice = state.maxPrice == null ? 150 : null;
  renderFilterLocks();
  refreshLots();
}

function toggleOpenNow() {
  if (!limits().openNowFilter) {
    showView("view-membership");
    return;
  }
  state.openNow = !state.openNow;
  renderFilterLocks();
  refreshLots();
}

function setSort(key) {
  if (key !== "distance" && !limits().advancedSort) {
    showView("view-membership");
    return;
  }
  if (!SORT_MODES.some((item) => item.key === key)) return;
  state.sort = key;
  renderFilterLocks();
  refreshLots();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.message || "İşlem başarısız"), { code: data.error });
  }
  return data;
}

function showAuth(mode) {
  state.authMode = mode === "register" ? "register" : "login";
  const isRegister = state.authMode === "register";
  el("auth-title").textContent = isRegister ? "Kayıt Ol" : "Giriş Yap";
  el("auth-subtitle").textContent = isRegister
    ? "E-posta ve parola ile ücretsiz hesap oluşturun."
    : "Hesabınıza girin.";
  el("auth-submit").textContent = isRegister ? "Hesap Oluştur" : "Giriş Yap";
  el("auth-switch").textContent = isRegister
    ? "Hesabınız var mı? Giriş yapın"
    : "Hesabınız yok mu? Kayıt olun";
  el("auth-password").setAttribute(
    "autocomplete",
    isRegister ? "new-password" : "current-password"
  );
  el("auth-error").classList.add("hidden");
  showView("view-auth");
}

function toggleAuthMode() {
  showAuth(state.authMode === "register" ? "login" : "register");
}

async function submitAuth() {
  const email = el("auth-email").value.trim();
  const password = el("auth-password").value;
  const error = el("auth-error");
  const button = el("auth-submit");
  error.classList.add("hidden");
  button.disabled = true;
  try {
    const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    const data = await api(path, { method: "POST", body: JSON.stringify({ email, password }) });
    state.user = data.user;
    el("auth-password").value = "";
    await loadFavorites();
    await loadSessions();
    startFavoriteAlerts();
    renderSession();
    showView("view-profile");
    refreshLots();
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    /* oturum yine de yerelde kapatılır */
  }
  state.user = null;
  state.favorites = new Map();
  clearInterval(state.alertTimer);
  state.alertTimer = null;
  state.watch = new Map();
  state.watchPrev = new Map();
  state.sessions = [];
  state.activeSession = null;
  renderSessions();
  state.onlyEmpty = false;
  state.maxPrice = null;
  state.openNow = false;
  state.sort = "distance";
  renderSession();
  showView("view-map");
  refreshLots();
}

async function upgradeTier(tierKey) {
  if (!state.user) {
    showAuth("register");
    return;
  }
  try {
    const data = await api("/api/auth/upgrade", {
      method: "POST",
      body: JSON.stringify({ tier: tierKey }),
    });
    state.user = data.user;
    await loadFavorites();
    startFavoriteAlerts();
    renderSession();
    renderMembership();
    refreshLots();
  } catch (err) {
    showGpsMessage(err.message, true);
  }
}

function renderMembership() {
  const wrap = el("membership-cards");
  if (!wrap) return;
  const current = state.user?.tier || null;
  wrap.innerHTML = state.tiers
    .map((tier) => {
      const isCurrent = current === tier.key;
      const highlight = tier.recommended;
      const perks = tier.perks
        .map(
          (perk) =>
            `<li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px] text-[#1a237e]">check</span><span>${escapeHtml(perk)}</span></li>`
        )
        .join("");
      const badge = highlight
        ? '<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1a237e] text-white font-label-lg px-3 py-1 rounded-full whitespace-nowrap">En ideal</span>'
        : "";
      const button = isCurrent
        ? '<button class="w-full mt-md rounded-lg border border-outline-variant py-3 font-label-lg text-on-surface-variant" disabled>Mevcut paketiniz</button>'
        : `<button class="w-full mt-md rounded-lg py-3 font-label-lg ${highlight ? "bg-[#1a237e] text-white" : "border border-[#1a237e] text-[#1a237e]"}" onclick="upgradeTier('${tier.key}')">${state.user ? `${escapeHtml(tier.name)} paketine geç` : "Hesap oluştur"}</button>`;
      return `
        <div class="relative bg-surface rounded-xl p-container-margin flex flex-col ${highlight ? "border-2 border-[#1a237e] shadow-lg md:-mt-2" : "border border-outline-variant"}">
          ${badge}
          <h3 class="font-headline-md text-on-surface ${highlight ? "mt-2" : ""}">${escapeHtml(tier.name)}</h3>
          ${tier.hook ? `<p class="font-label-md text-[#1a237e] mt-1">${escapeHtml(tier.hook)}</p>` : ""}
          <div class="flex items-end gap-1 mt-xs mb-sm">
            <span class="font-headline-lg text-[#1a237e] font-bold">${escapeHtml(tier.priceLabel)}</span>
            <span class="font-label-md text-on-surface-variant mb-1">/ ${escapeHtml(tier.periodLabel)}</span>
          </div>
          <ul class="flex flex-col gap-2 font-body-md text-on-surface-variant flex-grow">${perks}</ul>
          ${button}
        </div>`;
    })
    .join("");
}

function renderProfile() {
  const signedIn = Boolean(state.user);
  el("profile-guest").classList.toggle("hidden", signedIn);
  el("profile-account").classList.toggle("hidden", !signedIn);
  el("profile-plan").classList.toggle("hidden", !signedIn);
  el("profile-favorites-section").classList.toggle(
    "hidden",
    !signedIn || !limits().favoriteLimit
  );
  el("profile-export-section").classList.toggle("hidden", !signedIn || !limits().export);

  if (signedIn) {
    el("profile-avatar").textContent = state.user.email.slice(0, 2).toUpperCase();
    el("profile-name").textContent = state.user.email;
    el("profile-tier-badge").textContent = `${state.user.tierName} üyelik`;
    el("profile-created").textContent = state.user.createdAt
      ? `Üyelik tarihi: ${new Date(state.user.createdAt).toLocaleDateString("tr-TR")}`
      : "";
    const tier = state.tiers.find((item) => item.key === state.user.tier);
    el("profile-plan-perks").innerHTML = (tier?.perks || [])
      .map(
        (perk) =>
          `<li class="flex items-start gap-2"><span class="material-symbols-outlined text-[18px] text-[#1a237e]">check</span><span>${escapeHtml(perk)}</span></li>`
      )
      .join("");
    renderFavorites();
  }
}

function renderFavorites() {
  const list = el("profile-favorites-list");
  if (!list) return;
  const items = [...state.favorites.values()];
  el("profile-favorites-count").textContent = `${items.length} / ${limits().favoriteLimit}`;
  renderAlertControls();
  if (!items.length) {
    list.innerHTML =
      '<p class="font-body-md text-on-surface-variant">Henüz favori yok. Bir otoparkın detayında kalp simgesine dokunun.</p>';
    return;
  }
  list.innerHTML = items
    .map((fav) => {
      const live = state.watch.get(fav.id);
      const liveLine =
        live && live.emptySpots != null
          ? `<p class="font-label-md ${live.emptySpots > 0 ? "text-green-800 font-bold" : "text-red-800"}">${live.emptySpots > 0 ? `${live.emptySpots} boş yer` : "Şu an dolu"}${live.totalSpots ? ` / ${live.totalSpots}` : ""}</p>`
          : "";
      return `
      <div class="bg-surface rounded-lg border border-outline-variant p-sm flex items-center gap-sm">
        <span class="material-symbols-outlined text-[#1a237e]">favorite</span>
        <div class="flex-grow min-w-0">
          <p class="font-body-md truncate">${escapeHtml(fav.name || fav.id)}</p>
          <p class="font-label-md text-on-surface-variant">${sourceName(fav.source)}</p>
          ${liveLine}
        </div>
        <button class="text-on-surface-variant" onclick="removeFavorite('${escapeHtml(fav.id)}')" title="Kaldır">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>`;
    })
    .join("");
}

async function loadFavorites() {
  state.favorites = new Map();
  if (!state.user || !limits().favoriteLimit) return;
  try {
    const data = await api("/api/favorites");
    state.favorites = new Map(data.favorites.map((fav) => [fav.id, fav]));
  } catch {
    state.favorites = new Map();
  }
}

function sourceName(source) {
  if (source === "ispark") return "İSPARK";
  if (source === "izmir") return "İzmir Açık Veri";
  return "OpenStreetMap";
}

function alertsAllowed() {
  return Boolean(state.user) && Boolean(limits().favoriteLimit);
}

function renderAlertControls() {
  const button = el("favorites-alert-btn");
  const note = el("favorites-alert-note");
  if (!button || !note) return;
  button.textContent = state.alertsOn ? "Kapat" : "Aç";
  if (!state.alertsOn) {
    note.textContent =
      "Canlı veri veren favorinizde (İSPARK / İzmir) yer açıldığında bildirim gelir.";
    return;
  }
  const blocked = "Notification" in window && Notification.permission === "denied";
  const watched = [...state.watch.values()].filter((item) => item.live).length;
  const checked = state.alertCheckedAt
    ? new Date(state.alertCheckedAt).toLocaleTimeString("tr-TR")
    : "—";
  const scope = `${watched} canlı veri favorisi izleniyor`;
  note.textContent = blocked
    ? `Tarayıcı bildirimi engelli, uyarı harita mesajı olarak gösterilir. ${scope}.`
    : `${scope} · son kontrol ${checked}`;
}

function notifyFreedSpots(items) {
  const text = items
    .map((item) => `${item.name}: ${item.emptySpots} boş yer`)
    .join(" · ");
  showGpsMessage(`Yer açıldı — ${text}`, false);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("BoŞvEr — yer açıldı", { body: text, icon: "/logo.svg" });
  }
}

async function checkFavoriteAlerts() {
  if (!state.alertsOn || !alertsAllowed()) return;
  let data;
  try {
    data = await api("/api/favorites/watch");
  } catch {
    return;
  }
  const freed = [];
  (data.watched || []).forEach((item) => {
    state.watch.set(item.id, item);
    if (!item.live || item.emptySpots == null) return;
    if (state.watchPrev.get(item.id) === 0 && item.emptySpots > 0) freed.push(item);
    state.watchPrev.set(item.id, item.emptySpots);
  });
  state.alertCheckedAt = data.checkedAt || Date.now();
  if (freed.length) notifyFreedSpots(freed);
  renderFavorites();
}

function startFavoriteAlerts() {
  clearInterval(state.alertTimer);
  state.alertTimer = null;
  if (!state.alertsOn || !alertsAllowed()) return;
  checkFavoriteAlerts();
  state.alertTimer = setInterval(checkFavoriteAlerts, ALERT_POLL_MS);
}

function stopFavoriteAlerts() {
  clearInterval(state.alertTimer);
  state.alertTimer = null;
  state.alertsOn = false;
  state.watch = new Map();
  state.watchPrev = new Map();
  state.alertCheckedAt = null;
  try {
    localStorage.removeItem(ALERT_STORAGE_KEY);
  } catch {
    /* localStorage kapalı olabilir */
  }
}

async function toggleFavoriteAlerts() {
  if (!state.user) {
    showAuth("register");
    return;
  }
  if (!limits().favoriteLimit) {
    showView("view-membership");
    return;
  }
  if (state.alertsOn) {
    stopFavoriteAlerts();
    renderFavorites();
    return;
  }
  state.alertsOn = true;
  try {
    localStorage.setItem(ALERT_STORAGE_KEY, "1");
  } catch {
    /* localStorage kapalı olabilir */
  }
  if ("Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* izin istenemedi, harita mesajı kalır */
    }
  }
  startFavoriteAlerts();
  renderFavorites();
}

function renderFavoriteButton(lot) {
  const icon = el("detail-favorite-icon");
  const button = el("detail-favorite-btn");
  if (!icon || !button) return;
  const saved = state.favorites.has(lot.id);
  icon.textContent = saved ? "favorite" : "favorite_border";
  button.title = limits().favoriteLimit
    ? saved
      ? "Favorilerden çıkar"
      : "Favorilere ekle"
    : "Favoriler Plus üyelikte açılır";
}

async function toggleFavorite() {
  const lot = selectedLot();
  if (!lot) return;
  if (!state.user) {
    showAuth("register");
    return;
  }
  if (!limits().favoriteLimit) {
    showView("view-membership");
    return;
  }
  try {
    if (state.favorites.has(lot.id)) {
      await api(`/api/favorites/${encodeURIComponent(lot.id)}`, { method: "DELETE" });
      state.favorites.delete(lot.id);
    } else {
      await api("/api/favorites", {
        method: "POST",
        body: JSON.stringify({ id: lot.id, name: lot.name, lat: lot.lat, lng: lot.lng }),
      });
      state.favorites.set(lot.id, {
        id: lot.id,
        name: lot.name,
        source: lot.source,
      });
    }
    renderFavoriteButton(lot);
  } catch (err) {
    showGpsMessage(err.message, true);
  }
}

async function removeFavorite(lotId) {
  try {
    await api(`/api/favorites/${encodeURIComponent(lotId)}`, { method: "DELETE" });
    state.favorites.delete(lotId);
    renderFavorites();
  } catch (err) {
    showGpsMessage(err.message, true);
  }
}

function durationText(minutes) {
  const mins = Math.max(0, Math.round(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} dk`;
  if (!m) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

function liveDuration(startedAt) {
  return durationText((Date.now() - startedAt) / 60000);
}

function renderParkButton() {
  const label = el("detail-park-label");
  const icon = el("detail-park-icon");
  const note = el("detail-park-note");
  if (!label || !icon || !note) return;

  const lot = state.lots.find((item) => item.id === state.selectedId) || null;
  const active = state.activeSession;

  if (active && lot && active.lotId === lot.id) {
    label.textContent = `Çıktım · ${liveDuration(active.startedAt)}`;
    icon.textContent = "logout";
    note.textContent = "Çıkışta ücret, kaynaktaki gerçek tarifeye göre tahmin edilir.";
    note.classList.remove("hidden");
    return;
  }
  if (active) {
    label.textContent = "Aktif park oturumunuz var";
    icon.textContent = "info";
    note.textContent = `${active.lotName || "Başka otopark"} · ${liveDuration(active.startedAt)} — çıkış için dokunun`;
    note.classList.remove("hidden");
    return;
  }
  label.textContent = "Park ettim";
  icon.textContent = "local_parking";
  note.classList.add("hidden");
}

function renderSessions() {
  const card = el("activity-active");
  if (!card) return;
  const active = state.activeSession;
  card.classList.toggle("hidden", !active);
  if (active) {
    el("activity-active-name").textContent = active.lotName || active.lotId;
    el("activity-active-time").textContent = `${new Date(active.startedAt).toLocaleString("tr-TR")} · ${liveDuration(active.startedAt)}`;
  }

  const finished = state.sessions.filter((item) => item.endedAt != null);
  el("activity-guest").classList.toggle("hidden", Boolean(state.user));
  el("activity-empty").classList.toggle(
    "hidden",
    !state.user || Boolean(finished.length) || Boolean(active)
  );
  el("activity-list").innerHTML = finished
    .map(
      (item) => `
      <div class="bg-surface rounded-lg border border-outline-variant p-sm flex items-start gap-sm">
        <span class="material-symbols-outlined text-[#1a237e]">local_parking</span>
        <div class="flex-grow min-w-0">
          <p class="font-body-md truncate">${escapeHtml(item.lotName || item.lotId)}</p>
          <p class="font-label-md text-on-surface-variant">${escapeHtml(new Date(item.startedAt).toLocaleString("tr-TR"))} · ${escapeHtml(item.durationLabel)}</p>
          ${item.feeNote ? `<p class="font-label-md text-on-surface-variant">${escapeHtml(item.feeNote)}</p>` : ""}
        </div>
        <div class="text-right shrink-0">
          <p class="font-headline-md text-[#1a237e] font-bold">${escapeHtml(item.feeLabel || "—")}</p>
          <p class="font-label-md text-on-surface-variant">tahmini</p>
        </div>
      </div>`
    )
    .join("");
  renderParkButton();
}

async function loadSessions() {
  if (!state.user) {
    state.sessions = [];
    state.activeSession = null;
    renderSessions();
    return;
  }
  try {
    const data = await api("/api/sessions");
    state.sessions = data.sessions || [];
    state.activeSession = data.active || null;
  } catch {
    state.sessions = [];
    state.activeSession = null;
  }
  renderSessions();
}

async function toggleParkSession() {
  if (!state.user) {
    showAuth("register");
    return;
  }
  const lot = selectedLot();
  if (state.activeSession) {
    if (!lot || state.activeSession.lotId === lot.id) {
      await endParkSession();
      return;
    }
    showView("view-activity");
    return;
  }
  if (!lot) return;
  try {
    await api("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ id: lot.id, name: lot.name, lat: lot.lat, lng: lot.lng }),
    });
    await loadSessions();
    showGpsMessage(`${lot.name} için park süresi başladı.`, false);
  } catch (err) {
    showGpsMessage(err.message, true);
  }
}

async function endParkSession() {
  try {
    const data = await api("/api/sessions/end", { method: "POST" });
    const finished = data.session;
    await loadSessions();
    showGpsMessage(
      `${finished.lotName || "Otopark"} · ${finished.durationLabel} · tahmini ${finished.feeLabel}`,
      false
    );
  } catch (err) {
    showGpsMessage(err.message, true);
  }
}

function exportLots(format) {
  if (!limits().export) {
    showView("view-membership");
    return;
  }
  if (!state.user) {
    showAuth("login");
    return;
  }
  const params = bboxParams(filterParams());
  params.set("format", format);
  window.open(`/api/export?${params}`, "_blank");
}

function renderSession() {
  const signedIn = Boolean(state.user);
  const tierChip = el("header-tier");
  tierChip.classList.toggle("hidden", !signedIn);
  tierChip.classList.toggle("flex", signedIn);
  el("header-login").classList.toggle("hidden", signedIn);
  if (signedIn) el("header-tier-label").textContent = state.user.tierName;
  renderFilterLocks();
  renderProfile();
  renderMembership();
}

async function loadSession() {
  try {
    const data = await api("/api/auth/me");
    state.user = data.user;
    state.tiers = data.tiers || [];
  } catch {
    state.user = null;
  }
  await loadFavorites();
  await loadSessions();
  try {
    state.alertsOn = localStorage.getItem(ALERT_STORAGE_KEY) === "1";
  } catch {
    state.alertsOn = false;
  }
  startFavoriteAlerts();
  renderSession();
}

async function loadSources() {
  const wrap = el("profile-sources");
  if (!wrap) return;
  try {
    const data = await api("/api/sources");
    wrap.innerHTML = data.sources
      .map(
        (source) => `
        <div class="flex items-start gap-2">
          <span class="material-symbols-outlined text-[18px] ${source.live ? "text-green-700" : "text-on-surface-variant"}">${source.live ? "sensors" : "map"}</span>
          <div>
            <p class="font-body-md text-on-surface">${escapeHtml(source.label)}${source.lots ? ` · ${source.lots} otopark` : ""}</p>
            <p class="font-label-md">${escapeHtml(source.note)}</p>
            ${source.lastError ? `<p class="font-label-md text-error">Son hata: ${escapeHtml(source.lastError)}</p>` : ""}
          </div>
        </div>`
      )
      .join("");
  } catch {
    wrap.innerHTML =
      '<p class="font-body-md text-on-surface-variant">Kaynak bilgisi alınamadı.</p>';
  }
}

function showView(viewId) {
  const views = [
    "view-map",
    "view-search",
    "view-activity",
    "view-profile",
    "view-auth",
    "view-membership",
    "view-detail",
    "view-navigation",
  ];
  views.forEach((id) => {
    const node = el(id);
    if (!node) return;
    const show = id === viewId || (id === "view-map" && viewId === "view-detail");
    node.classList.toggle("view-hidden", !show);
    node.classList.toggle("view-visible", show);
  });

  const onMap = viewId === "view-map" || viewId === "view-detail";
  el("map-search-bar").classList.toggle("view-hidden", !onMap);
  el("map-search-bar").classList.toggle("view-visible", onMap);
  el("header-actions").classList.toggle(
    "hidden",
    viewId !== "view-profile" || !state.user
  );
  if (viewId === "view-profile") renderProfile();
  if (viewId === "view-membership") renderMembership();
  if (viewId === "view-activity") loadSessions();

  if (viewId !== "view-detail" && viewId !== "view-navigation") {
    document.querySelectorAll(".nav-item").forEach((nav) => {
      const active = nav.getAttribute("data-target") === viewId;
      nav.classList.toggle("text-primary", active);
      nav.classList.toggle("text-on-surface-variant", !active);
      nav.querySelector(".icon-container")?.classList.toggle("bg-secondary-container", active);
      nav.querySelector(".nav-label")?.classList.toggle("font-bold", active);
      const icon = nav.querySelector(".material-symbols-outlined");
      if (icon) icon.style.fontVariationSettings = active ? "'FILL' 1" : "'FILL' 0";
    });
    if (state.map) setTimeout(() => state.map.invalidateSize(), 200);
  }
}

function focusSearch() {
  showView("view-search");
  setTimeout(() => el("search-input-main").focus(), 100);
}

function syncSearchInputs(sourceId) {
  const val = el(sourceId).value;
  const otherId =
    sourceId === "map-search-input" ? "search-input-main" : "map-search-input";
  el(otherId).value = val;
}

function selectedLot() {
  return state.lots.find((item) => item.id === state.selectedId) || state.lots[0] || null;
}

function googleMapsUrl(lot, origin) {
  const dest = `${lot.lat},${lot.lng}`;
  const params = new URLSearchParams({
    api: "1",
    destination: dest,
    travelmode: "driving",
  });
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function openGoogleNav(lot) {
  const origin = state.hasGps ? state.origin : null;
  window.open(googleMapsUrl(lot, origin), "_blank");
}

function startNavigation() {
  const lot = selectedLot();
  if (!lot) return;
  if (state.hasGps) {
    openGoogleNav(lot);
    return;
  }
  requestGps({
    onSuccess: () => openGoogleNav(lot),
    onFail: () => openGoogleNav(lot),
  });
}

function openDirections() {
  startNavigation();
}

function placeUserMarker() {
  if (state.userMarker) state.map.removeLayer(state.userMarker);
  state.userMarker = L.circleMarker([state.origin.lat, state.origin.lng], {
    radius: 8,
    color: "#1a237e",
    fillColor: "#4c56af",
    fillOpacity: 1,
  }).addTo(state.map);
}

function gpsErrorMessage(err) {
  if (!navigator.geolocation) return "Bu tarayıcı konumu desteklemiyor.";
  if (err && err.code === 1) {
    return "Konum izni reddedildi. Tarayıcıdan izin verin (http://localhost:3000).";
  }
  if (err && err.code === 2) return "Konum alınamadı. GPS veya ağ konumunu açın.";
  if (err && err.code === 3) return "Konum zaman aşımına uğradı. Tekrar deneyin.";
  return "Konum alınamadı. Sayfayı localhost üzerinden açın ve izin verin.";
}

function requestGps({ onSuccess, onFail, fly = false } = {}) {
  if (!navigator.geolocation) {
    showGpsMessage(gpsErrorMessage(), true);
    onFail?.();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.origin = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      state.hasGps = true;
      placeUserMarker();
      hideGpsMessage();
      if (fly) {
        state.skipMoveFetch = true;
        state.map.setView([state.origin.lat, state.origin.lng], 15);
        setTimeout(() => {
          state.skipMoveFetch = false;
          refreshLots();
        }, 400);
      }
      onSuccess?.();
    },
    (err) => {
      showGpsMessage(gpsErrorMessage(err), true);
      onFail?.(err);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
  );
}

function simulateLocation(btn) {
  btn.classList.add("animate-pulse", "bg-primary", "text-white");
  requestGps({
    fly: true,
    onSuccess: () => btn.classList.remove("animate-pulse", "bg-primary", "text-white"),
    onFail: () => btn.classList.remove("animate-pulse", "bg-primary", "text-white"),
  });
}

function initMap() {
  state.map = L.map("leaflet-map", { zoomControl: false }).setView(
    [ADANA.lat, ADANA.lng],
    14
  );
  L.control.zoom({ position: "topright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(state.map);
  state.markersLayer = (L.markerClusterGroup
    ? L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 60,
        disableClusteringAtZoom: 16,
      })
    : L.layerGroup()
  ).addTo(state.map);
  state.map.on("moveend", onMapMoved);
}

async function init() {
  initMap();
  el("floating-card").addEventListener("click", () => {
    const lot = state.lots.find(
      (item) => String(item.id) === el("floating-card").dataset.id
    );
    if (lot) showDetailView(lot);
  });
  showView("view-map");
  setInterval(() => {
    if (state.activeSession) renderSessions();
  }, 30000);
  await loadSession();
  loadSources();
  requestGps({
    fly: true,
    onFail: () => {
      refreshLots();
    },
  });
}

init();
