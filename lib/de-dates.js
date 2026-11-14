// Shared, pure German-date helpers for the deterministic list parsers
// (lib/contao-events.js, lib/typo3-events.js). Every function returns null
// rather than guess: an ambiguous or impossible date means "skip the entry".

const MONTHS = {
  jan: 1, jän: 1, feb: 2, mär: 3, mar: 3, mrz: 3, apr: 4, mai: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12,
};

export function monthFromName(word) {
  return MONTHS[(word || '').toLowerCase().replace(/\./g, '').slice(0, 3)] || null;
}

function iso(y, m, d) {
  y = +y; m = +m; d = +d;
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export { iso as isoDate };

// "Mo".."So" weekday of an ISO date (0=So).
export function weekdayIndex(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const WD = { so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6 };
export function weekdayFromWord(w) {
  return WD[(w || '').toLowerCase().replace(/[.,]/g, '').slice(0, 2)] ?? null;
}

// One or two dates out of a short display string. Handles
//   "14.11.2026"  "14.11.26"  "14. Nov. 2026"  "14. November 2026"
//   "21.11. - 22.11.2026"  "17.11.2026 bis 18.11.2026"  "13. Nov. 2026 bis 14. Nov. 2026"
// A start without its own year takes the end's year. Returns
// { start, end|null } or null when no date or an inconsistent range.
// Three or more distinct dates (a list of dates in prose) -> null.
const NUM = String.raw`(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}|\d{2})(?!\d))?`;
const NAMED = String.raw`(\d{1,2})\.\s*(Jän(?:ner)?|Jan(?:uar)?|Feb(?:ruar)?|Mär(?:z)?|Mrz|Apr(?:il)?|Mai|Jun(?:i)?|Jul(?:i)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Okt(?:ober)?|Nov(?:ember)?|Dez(?:ember)?)\.?(?:\s*(\d{4}))?`;
export function parseDateSpan(text) {
  const t = (text || '').replace(/ /g, ' ');
  const found = [];
  const re = new RegExp(`${NUM}|${NAMED}`, 'giu');
  let m;
  while ((m = re.exec(t))) {
    if (m[1] !== undefined) found.push({ d: m[1], m: m[2], y: m[3] || null, at: m.index });
    else found.push({ d: m[4], m: monthFromName(m[5]), y: m[6] || null, at: m.index });
  }
  if (!found.length || found.length > 2) return null;
  // year-less start inherits the end's year
  if (found.length === 2 && !found[0].y) found[0].y = found[1].y;
  if (found.some((f) => !f.y)) return null;
  const dates = found.map((f) => iso(f.y, f.m, f.d));
  if (dates.some((d) => !d)) return null;
  if (dates.length === 2) {
    // only a range if joined by a range word/dash, not "14.11.2026 und 20.12.2026"
    const between = t.slice(found[0].at, found[1].at);
    if (!/(?:-|–|—|bis)\s*(?:(?:Mo|Di|Mi|Do|Fr|Sa|So)\b\.?,?\s*)?$/i.test(between)) return null;
    if (dates[1] < dates[0]) return null;
    if (dates[1] === dates[0]) return { start: dates[0], end: null };
    return { start: dates[0], end: dates[1] };
  }
  return { start: dates[0], end: null };
}

// "HH:MM" / "HH.MM Uhr" / "ab 19:00" / "10:30 - 12:00" -> {start,end}. 00:00 is
// treated as "no time" (CMS placeholder). Only clock-shaped times; a bare "um 10 Uhr"
// is left alone (null).
export function parseTimes(text) {
  // drop dates first so "21.11." is never read as 21:11
  const t = (text || '').replace(/\u00a0/g, ' ').replace(/\d{1,2}\.\s*\d{1,2}\.(?:\s*\d{4}|\s*\d{2}(?!\d))?/g, ' ');
  const tm = (h, mi) => {
    h = +h; mi = +mi;
    if (h > 23 || mi > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  };
  const m = t.match(/(?<![\d.])(\d{1,2})[:.](\d{2})(?!\d|\.\d)(?:\s*(?:Uhr)?\s*(?:-|–|—|bis)\s*(\d{1,2})[:.](\d{2})(?!\d))?/);
  if (!m) return { time_start: null, time_end: null };
  let a = tm(m[1], m[2]);
  let b = m[3] ? tm(m[3], m[4]) : null;
  if (a === '00:00') { a = null; b = null; }
  if (b === '00:00' || b === a || (b && a && b < a)) b = null; // equal or overnight end -> unknown
  return { time_start: a, time_end: a ? b : null };
}

export function absUrl(href, base) {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith('#') || /^(javascript|mailto|tel):/i.test(h)) return null;
  try { return new URL(h, base || undefined).toString(); } catch { return null; }
}

// <base href> if the page declares one, else the source url.
export function pageBase(html, src) {
  const m = html.match(/<base\s+href="([^"]+)"/i);
  return (m && absUrl(m[1], src?.url)) || src?.url || null;
}
