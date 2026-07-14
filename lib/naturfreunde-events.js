// Deterministic parser for the Naturfreunde Österreich events API (hidden
// JSON endpoint, POST /events/ng_items — see scripts/crawl.mjs for the
// pagination/fetch orchestration; this file is pure parsing, no network).
// Facts only: the item's `text` (a short teaser) is never copied into our
// description — description stays null. Category is a best-effort keyword
// guess off the title only, null when nothing matches (never forced).

// Day/month can drop the leading zero ("2.08.2026", not just "02.08.2026" —
// seen on real range items like "Mo., 27.07.2026 bis So., 2.08.2026").
const DE_DAY_DATE = /(\d{1,2})\.(\d{1,2})\.(\d{4})/g;
const pad2 = (n) => String(n).padStart(2, '0');

// "Di., 14.07.2026" -> {date_start:'2026-07-14', date_end:null}
// "Di., 14.07.2026 bis Do., 16.07.2026" -> {date_start, date_end}
// Unparseable -> both null (caller must skip — never fabricate a date).
export function parseNaturfreundeDate(dateStr) {
  const dates = [...String(dateStr || '').matchAll(DE_DAY_DATE)];
  if (!dates.length) return { date_start: null, date_end: null };
  const [, d1, m1, y1] = dates[0];
  const date_start = `${y1}-${pad2(m1)}-${pad2(d1)}`;
  let date_end = null;
  if (dates.length > 1) {
    const [, d2, m2, y2] = dates[1];
    date_end = `${y2}-${pad2(m2)}-${pad2(d2)}`;
  }
  return { date_start, date_end };
}

// Same shape/spirit as GEM2GO_CATEGORY_RULES (scripts/crawl.mjs) and
// CATEGORY_RULES (lib/dvv-events.js) — small, best-effort, null beats a guess.
const CATEGORY_RULES = [
  [/Wandern|Bergsteigen|Klettersteig|Klettern|Kletter|Mountainbike|\bMTB\b|\bBike\b|Radtour|Rad-Ausfahrt|\bLauf\b|Paddel|Kajak|Schwimmen|Turnier|Skitour|Schneeschuh|Nordic\s*Walking|Bouldern/i, 'sport'],
  [/Konzert|Musik/i, 'music'],
  [/Markt|Flohmarkt/i, 'market'],
  [/Fest\b|Brauchtum/i, 'festival'],
  [/Ausstellung|Theater|Museum|Fotowalk|Fotografie|Vortrag/i, 'culture'],
  [/Workshop|\bKurs\b|Seminar|Lehrgang/i, 'workshop'],
  [/Kulinarik|Kulinarisch/i, 'food'],
];
export function categorizeNaturfreunde(title) {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(title)) return cat;
  return null;
}

// One raw ng_items item -> our event shape. Coordinates come straight from
// the source (each Ortsgruppe enters lat/lon for its own offering) — used
// as-is, geo_precision 'venue', no forward-geocoding needed. The feed has no
// address/town field at all, and the `organisation` (Ortsgruppe name) is not
// reliable evidence of the event's actual town — e.g. "Naturfreunde
// Mistelbach" organizing a "Klettertreff" that the coordinates place in
// Wolkersdorf, 30km away. So town stays null rather than guessed.
export function parseNaturfreundeItem(item, baseUrl) {
  const title = (item.title || '').trim();
  if (!title) return null;
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return null; // no coords -> can't place it, skip
  if (!item.link) return null; // hard rule 1: every event needs a linkback
  const { date_start, date_end } = parseNaturfreundeDate(item.date_str);
  if (!date_start) return null; // never fabricate: no date -> skip
  const guessed = categorizeNaturfreunde(title);
  return {
    title, date_start, date_end,
    venue: null, address: null, town: null,
    categories: guessed ? [guessed, 'family'] : ['family'],
    is_free: null, age_min: null, age_max: null, indoor: null,
    description: null,
    source_url: new URL(item.link, baseUrl).toString(),
    lat: item.lat, lng: item.lon,
  };
}
