// Duplicate detection + merge planning for events. Pure functions — no DB
// access here (callers supply `existing`, typically publishedEvents() from
// lib/db.js). Two entry points create dupes today: a scanned poster for an
// event we already crawled, and two crawl sources listing the same event
// (content_hash in lib/db.js only catches byte-identical extractions).
//
// Deliberately does NOT import lib/geocode.js (concurrent edits there, and it
// pulls in the DB pool) — a small local haversine covers the ~300m need here.

const EARTH_KM = 6371;

function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

// lowercase, ß→ss, strip accents/diacritics, strip punctuation, collapse whitespace.
// Charset extended for Cyrillic (Ѐ-ӿ, U+0400-U+04FF, Bulgaria) — same
// reasoning as contentHash() in lib/db.js: adding to the allow-list never
// changes what an existing German/Latin title normalizes to.
function normalizeTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\sЀ-ӿ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTown(s) {
  return normalizeTitle(s);
}

function tokenSet(s) {
  return new Set(normalizeTitle(s).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function titlesMatch(titleA, titleB) {
  const na = normalizeTitle(titleA);
  const nb = normalizeTitle(titleB);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Word-boundary containment (space-padded), never raw substring — "fest"
  // must not match inside "sommerfest" (same bug class fixed in
  // lib/geocode.js nameMatches).
  if (` ${na} `.includes(` ${nb} `) || ` ${nb} `.includes(` ${na} `)) return true;
  return jaccard(tokenSet(titleA), tokenSet(titleB)) >= 0.75;
}

function sameDay(a, b) {
  const da = (a || '').slice(0, 10);
  const db = (b || '').slice(0, 10);
  return !!da && !!db && da === db;
}

function sameOccurrenceTime(a, b) {
  // A source with only an all-day date can still enrich a timed copy from
  // another source. Two explicit, different wall-clock starts are separate
  // independently navigable occurrences, never duplicates.
  if (a.all_day || b.all_day) return true;
  const ta = (a.starts_at || '').slice(11, 16);
  const tb = (b.starts_at || '').slice(11, 16);
  return !ta || !tb || ta === tb;
}

function sameLocation(a, b) {
  const ta = normalizeTown(a.town);
  const tb = normalizeTown(b.town);
  // Precise coordinates outrank the coarse town label. This keeps two
  // simultaneous performances in different venues within Stuttgart apart.
  // Coords apply only when BOTH sides carry better-than-town precision.
  // Town-centroid coords are sentinels, not positions — two unrelated events
  // in the same town share identical centroid coords (tasks/lessons.md,
  // 2026-07-11; same fix as the UI's sameVenue grouping).
  if (
    a.geo_precision && a.geo_precision !== 'town' &&
    b.geo_precision && b.geo_precision !== 'town' &&
    typeof a.lat === 'number' && typeof a.lng === 'number' &&
    typeof b.lat === 'number' && typeof b.lng === 'number'
  ) {
    return distanceKm(a, b) <= 0.3; // ~300m
  }
  return !!ta && !!tb && ta === tb;
}

// candidate: event-shaped object (starts_at Vienna-local string, town, title,
// optionally lat/lng). existing: array of published events (same shape, plus id).
// Returns the matching existing row, or null.
export function findDuplicate(candidate, existing) {
  if (!candidate || !candidate.title || !candidate.starts_at) return null;
  for (const ev of existing || []) {
    if (!ev || ev.kind === 'place') continue;
    if (!sameDay(ev.starts_at, candidate.starts_at)) continue;
    if (!sameOccurrenceTime(ev, candidate)) continue;
    if (!sameLocation(ev, candidate)) continue;
    if (!titlesMatch(ev.title, candidate.title)) continue;
    return ev;
  }
  return null;
}

// Field-level enrichment plan: fill `existing`'s NULL/empty fields from
// `candidate`. Never overwrites a non-null/non-empty field on `existing`.
// source_url/source_name are intentionally excluded — first-seen wins
// (multi-source attribution is a future schema change).
const ENRICHABLE_FIELDS = [
  'description', 'ends_at', 'address', 'venue', 'is_free',
  'age_min', 'age_max', 'indoor', 'photo_path',
];

function isEmpty(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

export function mergePlan(existing, candidate) {
  const patch = {};
  for (const field of ENRICHABLE_FIELDS) {
    if (!isEmpty(existing[field])) continue;
    const value = candidate[field];
    if (isEmpty(value)) continue;
    if (field === 'ends_at') {
      // Guard the ends_at > starts_at invariant (tasks/lessons.md) — only fill
      // from the candidate if it would actually be a valid end time.
      if (!existing.starts_at || value <= existing.starts_at) continue;
    }
    patch[field] = value;
  }
  if (isEmpty(existing.categories) && Array.isArray(candidate.categories) && candidate.categories.length) {
    patch.categories = candidate.categories;
  }
  return patch;
}
