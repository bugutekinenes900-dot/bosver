function parseMinutes(hour, minute) {
  return Number(hour) * 60 + Number(minute);
}

function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function isOpenNow(workHours, date = new Date()) {
  const text = String(workHours || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/24\s*(saat|hour|h\b)|always|s[üu]rekli|gece\s*g[üu]nd[üu]z/.test(lower)) {
    return true;
  }
  if (/kapal[ıi]|closed/.test(lower) && !/\d/.test(lower)) return false;

  const match = text.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (!match) return null;

  const start = parseMinutes(match[1], match[2]);
  const end = parseMinutes(match[3], match[4]);
  const now = nowMinutes(date);
  if (end > start) return now >= start && now < end;
  return now >= start || now < end;
}

module.exports = { isOpenNow };
