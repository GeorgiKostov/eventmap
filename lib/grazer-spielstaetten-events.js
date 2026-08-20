// Deterministic adapter for the Grazer Spielstätten programme.
//
// The public page is a JavaScript shell. Its own schedule script POSTs JSON
// to the endpoint below, returning 20 entries at a time. The API already
// carries the title, local date/time, venue and stable event id, so detail
// pages are not needed for extraction; the id is enough to build the official
// event linkback.

import { decodeEntities, stripTags } from './entities.js';
import { splitLocalDateTime } from './event-time.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const GRAZER_SPIELSTAETTEN_API =
  'https://spielstaetten.buehnen-graz.com/wp-content/themes/enfold_child/json/schedule.php';
export const GRAZER_SPIELSTAETTEN_PAGE = 'https://spielstaetten.buehnen-graz.com/';

const PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 50;

function text(value) {
  return stripTags(decodeEntities(value || '')) || null;
}

function categoriesForGenre(value) {
  const genre = String(value || '').toLowerCase();
  const categories = [];
  if (/konzert|musik|jazz|metal|hip.?hop|rock|pop|electro|elektron|kammer|orchester|lied/.test(genre)) {
    categories.push('music');
  }
  if (/theater|oper|ballett|tanz|kabarett|lesung|schauspiel|musical|vernissage|ausstellung|film|kultur/.test(genre)) {
    categories.push('culture');
  }
  if (/club|clubbing|ball|gala|party|disco/.test(genre)) categories.push('party');
  if (/kind|jugend|famil/.test(genre)) categories.push('family');
  return [...new Set(categories)];
}

function eventUrl(id, base = GRAZER_SPIELSTAETTEN_PAGE) {
  if (!id) return null;
  try {
    return new URL(`/event/${encodeURIComponent(String(id))}/`, base).toString();
  } catch {
    return null;
  }
}

function isTruthyFlag(value) {
  return value === true || value === 1 || value === '1' || String(value || '').toLowerCase() === 'true';
}

// One schedule.php entry → the crawler's raw event contract.
// The API's `date` is a Vienna-local wall-clock value; splitLocalDateTime
// deliberately keeps the literal digits and never applies a UTC conversion.
export function parseGrazerSpielstaettenEntry(entry, src = {}) {
  if (!entry || isTruthyFlag(entry.canceled) || isTruthyFlag(entry.privateEvent)) return null;

  const title = text(entry.title);
  const source_url = eventUrl(entry.eventId, src.url || GRAZER_SPIELSTAETTEN_PAGE);
  const { date: date_start, time: time_start } = splitLocalDateTime(entry.date);
  if (!title || !source_url || !date_start) return null;

  return {
    title,
    date_start,
    time_start,
    date_end: null,
    time_end: null,
    venue: text(entry.location),
    address: null,
    town: src.town || 'Graz',
    categories: categoriesForGenre(entry.genre),
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    description: null,
    source_url,
  };
}

// Fetch all public schedule entries. The site paginates by the number of
// entries already returned (`entryCount`), not by page number. Stop on a short
// page, a repeated page, malformed data, or the hard page cap so a provider
// bug cannot create an unbounded crawl.
export async function fetchGrazerSpielstaettenEvents(src = {}, {
  fetchImpl = politeFetch,
  robotsCheck = robotsAllowed,
  maxPages = DEFAULT_MAX_PAGES,
  apiUrl = GRAZER_SPIELSTAETTEN_API,
} = {}) {
  try {
    if (!(await robotsCheck(apiUrl))) return [];
  } catch {
    return [];
  }

  const seen = new Set();
  const events = [];
  let entryCount = 0;

  for (let page = 0; page < maxPages; page++) {
    let response;
    try {
      response = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryCount, search: null, locations: [], genres: [], date: null }),
      });
      if (!response?.ok) break;
    } catch {
      break;
    }

    let payload;
    try { payload = await response.json(); } catch { break; }
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    if (!entries.length) break;

    let newIds = 0;
    for (const entry of entries) {
      const id = entry?.eventId == null ? null : String(entry.eventId);
      if (id && seen.has(id)) continue;
      if (id) { seen.add(id); newIds++; }
      const event = parseGrazerSpielstaettenEntry(entry, src);
      if (event) events.push(event);
    }

    if (!newIds && entries.length >= PAGE_SIZE) break;
    entryCount += entries.length;
    if (entries.length < PAGE_SIZE) break;
  }

  return events;
}
