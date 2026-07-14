// Deterministic parser for the Kinderfreunde Österreich events listing
// (server-rendered HTML cards, paginated 10/page). Facts only: description
// stays null (never copy their prose); no photos. Never fabricate — dates
// come straight off the card, town is only set when the address text gives
// us something to work with.

import { decodeEntities, stripTags } from './entities.js';
function absUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

// "27.02.2026" -> date_start only; "28.02.2026–31.12.2026" -> date_start+date_end.
// No parseable date -> both null (caller must skip, never fabricate).
function parseKfDate(raw) {
  const m = (raw || '').match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s*[–-]\s*(\d{2})\.(\d{2})\.(\d{4}))?/);
  if (!m) return { date_start: null, date_end: null };
  const date_start = `${m[3]}-${m[2]}-${m[1]}`;
  const date_end = m[4] ? `${m[6]}-${m[5]}-${m[4]}` : null;
  return { date_start, date_end };
}

// "18:00 Uhr" -> time_start only; "15:30–17:00 Uhr" -> both. "00:00–00:00 Uhr"
// is the site's own placeholder for "no specific time" — treated as no time.
function parseKfTime(raw) {
  const m = (raw || '').match(/(\d{2}:\d{2})(?:\s*[–-]\s*(\d{2}:\d{2}))?/);
  if (!m) return { time_start: null, time_end: null };
  if (m[1] === '00:00' && (m[2] || '00:00') === '00:00') return { time_start: null, time_end: null };
  return { time_start: m[1], time_end: m[2] || null };
}

// "1 - 5 Jahre" / "0,5 - 3 Jahre" (European decimal comma, half-years) -> a
// {min,max} pair; upsertEvent's toIntMin/toIntMax (lib/db.js) floor/ceil the
// rest. Anything not matching a clean "N - M" pair -> both null (never guess
// an age range from an ambiguous label).
function parseKfAge(raw) {
  const num = '\\d{1,2}(?:[.,]\\d+)?';
  const m = (raw || '').match(new RegExp(`(${num})\\s*[–-]\\s*(${num})`));
  if (!m) return { age_min: null, age_max: null };
  const toNum = (s) => Number(s.replace(',', '.'));
  return { age_min: toNum(m[1]), age_max: toNum(m[2]) };
}

// A venue name and a street rarely arrive in a consistent order ("Hotel GIP,
// Ungarnstraße 10" vs "Alois Edlingergasse 34, Kinderfreundeheim") — the one
// with a digit (house number) is the street/address, the one without is the
// venue name. Ambiguous (0 or 2+ digit-bearing segments) -> best-effort
// first-segment-is-venue fallback.
function splitVenueAddress(segs) {
  if (!segs.length) return { venue: null, address: null };
  if (segs.length === 1) return { venue: null, address: segs[0] };
  const withDigit = segs.filter((s) => /\d/.test(s));
  const withoutDigit = segs.filter((s) => !/\d/.test(s));
  if (withDigit.length === 1 && withoutDigit.length >= 1) {
    return { venue: withoutDigit[0], address: withDigit[0] };
  }
  return { venue: segs[0], address: segs.slice(1).join(', ') };
}

// Address text seen on real cards:
//  "Hotel GIP, Ungarnstraße 10, 7503 Großpetersdorf"        (venue, street, plz+city)
//  "Kinderfreunde-Haus Dauphinestraße 151, 4030 Linz"        (venue+street, plz+city)
//  "Alois Edlingergasse 34, Kinderfreundeheim"               (street, venue — no plz)
//  "Kinderfreundeheim Graz - Wetzelsdorf, 8052 Graz, Peter-Rosegger-Straße 98," (venue, plz+city, street — plz+city in the MIDDLE)
//  "1080, Hamerlingpark (außerhalb des Parks)"               (bare district number, no city name)
//  "St. Florian am Inn"                                      (bare town name)
// Town is only trusted when SOME comma-segment is a "PLZ Ort" pair (searched
// anywhere, not just last — the source doesn't keep a fixed field order), or
// the whole (single, non-street-looking) string reads as a town name — never
// mislabel a bare postcode digit or a street as a town.
function parseKfAddress(raw) {
  if (!raw) return { venue: null, address: null, town: null };
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const plzIdx = parts.findIndex((p) => /^\d{4,5}\s+.+$/.test(p));
  if (plzIdx !== -1) {
    const m = parts[plzIdx].match(/^(\d{4,5})\s+(.+)$/);
    const { venue, address } = splitVenueAddress(parts.filter((_, i) => i !== plzIdx));
    return { venue, address, town: m[2] };
  }
  if (/^\d{4,5}$/.test(parts[0] || '')) {
    // Bare postcode with no attached city name — can't resolve a town from a
    // number alone (never fabricate).
    return { venue: null, address: parts.slice(1).join(', ') || null, town: null };
  }
  if (parts.length === 1) {
    const isStreetLike = /\b(straße|strasse|gasse|weg|platz|allee|ring|steig)\b/i.test(parts[0]) && /\d/.test(parts[0]);
    if (isStreetLike) return { venue: null, address: parts[0], town: null };
    return { venue: null, address: null, town: parts[0] };
  }
  const { venue, address } = splitVenueAddress(parts);
  return { venue, address, town: null };
}

// One <li class="card ..."> block -> our event shape, or null if unparseable.
export function parseKinderfreundeCard(block, pageUrl) {
  const titleMatch = block.match(/card-title[^"]*">([\s\S]*?)<\/h4>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : null;
  if (!title) return null;

  const linkMatch = block.match(/class="readmore"\s+href="([^"]+)"/i) || block.match(/<a\s+href="([^"]+)"/i);
  const source_url = linkMatch ? absUrl(linkMatch[1], pageUrl) : null;
  if (!source_url) return null; // hard rule 1: every event needs a linkback

  const dateMatch = block.match(/fa-calendar-day[\s\S]{0,120}?<\/i>(?:<span[^>]*>[\s\S]*?<\/span>)?\s*([^<]+)</i);
  const { date_start, date_end } = parseKfDate(dateMatch ? dateMatch[1] : null);
  if (!date_start) return null; // never fabricate: no date -> skip

  const timeMatch = block.match(/fa-clock[\s\S]{0,120}?<\/i>(?:<span[^>]*>[\s\S]*?<\/span>)?\s*([^<]+)</i);
  const { time_start, time_end } = parseKfTime(timeMatch ? timeMatch[1] : null);

  const addrMatch = block.match(/fa-map-marker-alt[\s\S]{0,150}?<\/i>(?:<span[^>]*>[\s\S]*?<\/span>)?\s*([^<]+)</i);
  const { venue, address, town } = parseKfAddress(addrMatch ? stripTags(addrMatch[1]) : null);

  const ageMatch = block.match(/fa-birthday-cake[\s\S]{0,150}?<\/i>(?:<span[^>]*>[\s\S]*?<\/span>)?\s*([\s\S]*?)<\/span>/i);
  const { age_min, age_max } = parseKfAge(ageMatch ? stripTags(ageMatch[1]) : null);

  return {
    title, date_start, time_start, date_end, time_end,
    venue, address, town,
    categories: ['family'], is_free: null, age_min, age_max, indoor: null,
    description: null, source_url,
  };
}

export function parseKinderfreundeEvents(html, pageUrl) {
  const cards = [...String(html || '').matchAll(/<li class="card[^"]*">([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  const events = [];
  for (const card of cards) {
    const ev = parseKinderfreundeCard(card, pageUrl);
    if (ev) events.push(ev);
  }
  return events;
}

// Pagination: "page-item"/"page-link" anchors carry "?partial=0&amp;pe=N"
// (HTML-entity-encoded &); the highest N found is the last page. No
// pagination block (e.g. a single-page result) -> 1.
export function kinderfreundePageCount(html) {
  const nums = [...String(html || '').matchAll(/[?&](?:amp;)?pe=(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(1, ...nums) : 1;
}
