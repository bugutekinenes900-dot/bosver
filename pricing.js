const CURRENCY_SYMBOLS = {
  TRY: "₺",
  TL: "₺",
  TRL: "₺",
  "₺": "₺",
  EUR: "€",
  "€": "€",
  USD: "$",
  $: "$",
  GBP: "£",
  "£": "£",
};

const PERIOD_WORDS = {
  hour: "saat",
  hours: "saat",
  hr: "saat",
  hrs: "saat",
  h: "saat",
  saat: "saat",
  st: "saat",
  day: "gün",
  days: "gün",
  daily: "gün",
  gun: "gün",
  "gün": "gün",
  tag: "gün",
  min: "dakika",
  mins: "dakika",
  minute: "dakika",
  minutes: "dakika",
  dk: "dakika",
  dakika: "dakika",
  week: "hafta",
  weeks: "hafta",
  hafta: "hafta",
  month: "ay",
  months: "ay",
  monat: "ay",
  ay: "ay",
  year: "yıl",
  yil: "yıl",
  "yıl": "yıl",
};

const FREE_WORDS = [
  "free",
  "no",
  "none",
  "ucretsiz",
  "bedava",
  "gratis",
  "kostenlos",
  "0",
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ü", "u")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replaceAll("ö", "o")
    .replaceAll("ğ", "g")
    .trim();
}

function parseAmount(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let cleaned = text;
  if (hasComma && hasDot) {
    const decimalSep = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    const groupSep = decimalSep === "," ? "." : ",";
    cleaned = text.split(groupSep).join("").replace(decimalSep, ".");
  } else if (hasComma) {
    const decimals = text.length - text.lastIndexOf(",") - 1;
    cleaned = decimals === 3 ? text.split(",").join("") : text.replace(",", ".");
  } else if (hasDot) {
    const decimals = text.length - text.lastIndexOf(".") - 1;
    cleaned = decimals === 3 ? text.split(".").join("") : text;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatAmount(amount) {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString("tr-TR")
    : rounded.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formatMoney(amount, currency = "₺") {
  const symbol = CURRENCY_SYMBOLS[String(currency).toUpperCase()] || null;
  const value = formatAmount(amount);
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

function formatTry(amount) {
  return `₺${formatAmount(amount)}`;
}

function chargeSaysFree(charge) {
  const text = normalize(charge);
  if (!text) return false;
  if (FREE_WORDS.includes(text)) return true;
  if (/^0([.,]0+)?\s*(try|tl|eur|usd|₺|€|\$)?\s*(\/.*)?$/.test(text)) return true;
  return /\b(ucretsiz|bedava|free of charge|no charge|kostenlos)\b/.test(text);
}

function parseCharge(charge) {
  const text = String(charge || "").trim();
  if (!text) return null;
  if (chargeSaysFree(text)) return { free: true };

  const CURRENCY = "TRY|TRL|TL|₺|EUR|€|USD|\\$|GBP|£";
  const withPeriod = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*(${CURRENCY})?\\s*(?:\\/|per|başına)\\s*(\\d+)?\\s*([A-Za-zÇĞİÖŞÜçğıöşü]+)`,
    "i"
  );
  const match = text.match(withPeriod);

  if (match) {
    const amount = parseAmount(match[1]);
    const unit = PERIOD_WORDS[normalize(match[4])];
    const count = match[3] ? parseInt(match[3], 10) : 1;
    if (amount != null && unit && Number.isFinite(count) && count >= 1) {
      const currency = match[2] || "TRY";
      const period = count === 1 ? unit : `${count} ${unit}`;
      return {
        free: false,
        amount,
        currency,
        unit,
        periodCount: count,
        label: `${formatMoney(amount, currency)} / ${period}`,
      };
    }
  }

  const amountOnly = text.match(
    new RegExp(`^\\s*(?:(${CURRENCY})\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(?:(${CURRENCY})\\s*)?$`, "i")
  );
  if (amountOnly) {
    const amount = parseAmount(amountOnly[2]);
    const currency = amountOnly[1] || amountOnly[3];
    if (amount != null && currency) {
      return {
        free: false,
        amount,
        currency,
        unit: null,
        periodCount: null,
        label: formatMoney(amount, currency),
        note: "OSM'de süre birimi belirtilmemiş",
      };
    }
  }

  return null;
}

function osmPrice({ fee, charge }) {
  const parsed = parseCharge(charge);

  if (fee === "no" || parsed?.free) {
    return { priceLabel: "Ücretsiz", isFree: true, pricePerHour: null, priceNote: null };
  }
  if (parsed) {
    return {
      priceLabel: parsed.label,
      isFree: false,
      pricePerHour:
        parsed.unit === "saat" && parsed.periodCount === 1 ? parsed.amount : null,
      priceNote: parsed.note || null,
    };
  }
  if (charge && String(charge).trim()) {
    return {
      priceLabel: String(charge).trim(),
      isFree: false,
      pricePerHour: null,
      priceNote: "OSM charge etiketinden alındı",
    };
  }
  if (fee === "yes") {
    return {
      priceLabel: "Ücretli (fiyat OSM'de yok)",
      isFree: false,
      pricePerHour: null,
      priceNote: "OSM kaydında ücretli işaretli, tutar girilmemiş",
    };
  }
  return {
    priceLabel: "Fiyat bilgisi OSM'de yok",
    isFree: null,
    pricePerHour: null,
    priceNote: "OpenStreetMap kaydında fee/charge etiketi girilmemiş",
  };
}

function osmCapacity(capacity) {
  if (capacity) return `${capacity.toLocaleString("tr-TR")} araçlık`;
  return "Kapasite OSM'de kayıtlı değil";
}

function parseTariff(tariff) {
  const text = String(tariff || "").trim();
  if (!text) return [];
  return text
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.lastIndexOf(":");
      if (idx === -1) return null;
      const label = part.slice(0, idx).trim();
      const amount = parseAmount(part.slice(idx + 1));
      if (!label || amount == null) return null;
      return { label, amount, amountLabel: formatTry(amount) };
    })
    .filter(Boolean);
}

function isparkPrice(row) {
  const bands = parseTariff(row.tariff);
  const hourly = bands.find((band) => /^0\s*-\s*1\s*saat/i.test(band.label));
  const fullDay = bands.find((band) => /tam\s*g[üu]n/i.test(band.label));

  if (bands.length && bands.every((band) => band.amount === 0)) {
    return { priceLabel: "Ücretsiz", isFree: true, pricePerHour: null, bands, priceNote: null };
  }
  if (hourly) {
    return {
      priceLabel: `${formatTry(hourly.amount)} / ilk saat`,
      isFree: false,
      pricePerHour: hourly.amount,
      bands,
      priceNote: null,
    };
  }
  if (fullDay) {
    return {
      priceLabel: `${formatTry(fullDay.amount)} / tam gün`,
      isFree: false,
      pricePerHour: null,
      bands,
      priceNote: null,
    };
  }
  if (bands.length) {
    return {
      priceLabel: `${bands[0].amountLabel} / ${bands[0].label}`,
      isFree: false,
      pricePerHour: null,
      bands,
      priceNote: null,
    };
  }
  if (row.tariff && String(row.tariff).trim()) {
    return {
      priceLabel: String(row.tariff).trim(),
      isFree: false,
      pricePerHour: null,
      bands,
      priceNote: "İSPARK tarife metni",
    };
  }
  return {
    priceLabel: "Tarife İSPARK'ta yayınlanmamış",
    isFree: null,
    pricePerHour: null,
    bands,
    priceNote: "İSPARK bu otopark için tarife döndürmedi",
  };
}

function bandRange(label) {
  const text = normalize(label);
  if (/\b(ay|aylik|abonman|abone)\b/.test(text)) return null;
  const span = text.match(/(\d+)\s*-\s*(\d+)\s*saat/);
  if (span) return { to: Number(span[2]), fullDay: false };
  if (/tam\s*gun|gunluk|24\s*saat/.test(text)) return { to: 24, fullDay: true };
  const single = text.match(/(\d+)\s*saat/);
  if (single) return { to: Number(single[1]), fullDay: false };
  return null;
}

function durationLabel(minutes) {
  const mins = Math.max(0, Math.round(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} dk`;
  if (!m) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

function estimateSessionFee(lot, minutes) {
  const mins = Math.max(0, Math.round(minutes));
  const hours = mins / 60;

  if (lot?.freeTimeMinutes > 0 && mins <= lot.freeTimeMinutes) {
    return {
      amount: 0,
      label: "Ücretsiz",
      note: `İlk ${lot.freeTimeMinutes} dk ücretsiz, süreniz ${durationLabel(mins)}`,
    };
  }
  if (lot?.isFree === true) {
    return { amount: 0, label: "Ücretsiz", note: "Kaynak bu otoparkı ücretsiz kaydetmiş" };
  }

  const bands = (lot?.priceBands || [])
    .map((band) => ({ ...band, range: bandRange(band.label) }))
    .filter((band) => band.range);
  const hourly = bands
    .filter((band) => !band.range.fullDay)
    .sort((a, b) => a.range.to - b.range.to);
  const fullDay = bands.find((band) => band.range.fullDay);

  const tariffName = lot?.sourceLabel ? `${lot.sourceLabel} tarifesi` : "Tarife";
  const match = hourly.find((band) => hours <= band.range.to);
  if (match) {
    return {
      amount: match.amount,
      label: formatTry(match.amount),
      note: `${tariffName} · ${match.label}`,
    };
  }
  if (fullDay) {
    const days = Math.max(1, Math.ceil(hours / 24));
    const amount = fullDay.amount * days;
    return {
      amount,
      label: formatTry(amount),
      note: days > 1 ? `${tariffName} · tam gün × ${days}` : `${tariffName} · ${fullDay.label}`,
    };
  }
  const top = hourly[hourly.length - 1];
  if (top) {
    return {
      amount: top.amount,
      label: formatTry(top.amount),
      note: `Tarifedeki en üst dilim (${top.label}) uygulandı`,
    };
  }

  if (Number.isFinite(lot?.pricePerHour)) {
    const billed = Math.max(1, Math.ceil(hours));
    const amount = lot.pricePerHour * billed;
    return {
      amount,
      label: formatTry(amount),
      note: `Saatlik ${formatTry(lot.pricePerHour)} × ${billed} saat`,
    };
  }

  return {
    amount: null,
    label: "Tahmin edilemedi",
    note: "Kaynakta bu otopark için tarife yok, uydurma fiyat gösterilmiyor",
  };
}

module.exports = {
  parseAmount,
  formatAmount,
  formatTry,
  formatMoney,
  parseCharge,
  osmPrice,
  osmCapacity,
  parseTariff,
  isparkPrice,
  durationLabel,
  estimateSessionFee,
};
