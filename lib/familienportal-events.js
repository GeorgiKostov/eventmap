// Deterministic paginated parser for familienportal.berlin.de — the Land Berlin
// family portal (jup.berlin / Jugend- und Familienportal), TYPO3 + the
// ke_search extension. It is the single highest-yield family source in the
// German expansion: ~5,400 dated kids/family events, robots-clean, but with NO
// JSON-LD / Microdata / iCal — the generic LLM route sees only the first page
// (~10 events). This walks the pages so the events are actually reachable.
//
// The listing is a plain server-rendered result set, sorted ASCENDING by date,
// 10 cards per page:
//   <article class="modul-teaser">
//     <h3 class="title">…</h3>
//     <p class="text--meta"> DD.MM.YYYY | HH:MM Uhr | <Bezirk> </p>
//     …<a class="more" href="/veranstaltungen-3/termin/<slug>-YYYYMMDD-<id>">
//
// The meta line is PIPE-SEPARATED and the middle field is a TIME, not a place:
// "17.07.2026 | 10:00 Uhr | Pankow". The time is sometimes absent (2 fields:
// "date | Berlinweit"), so segments are classified, not positional — reading
// the 2nd field as a venue would both invent venue="10:00 Uhr" AND drop the
// real 10:00, the twin fabrication of tasks/lessons.md 2026-07-14.
//
// The location is a Berlin Bezirk (Pankow, Mitte, Treptow-Köpenick…), which
// geocodes to borough precision — finer than "Berlin", and honest. It is a
// TOWN qualifier ("<Bezirk>, Berlin"), never a venue: the listing gives no
// venue, so venue stays null (hard rule 5 — a confident-but-wrong pin is worse
// than an honest one). "Berlinweit"/"Berliner-Umland" are citywide, not places
// → town falls back to "Berlin".
//
// Pagination: ?tx_kesearch_pi1[controller]=EventSearchResult&currentPage=N
//
// BOUNDED ON PURPOSE. The nightly crawl re-fetches, and events sort ascending,
// so a near-term window refreshed every night captures each event well before
// it happens — grabbing all ~540 pages nightly would be ~9 min against one host
// for far-future events that will be re-seen as they approach. `maxPages`
// (env FAMILIENPORTAL_MAX_PAGES) caps it; we also stop as soon as a whole page
// is past the horizon, or a page yields no cards. Raise the cap to reach deeper.
//
// Facts only (hard rule 1): the card's `<p class="text">` teaser is the portal's
// own prose and is NEVER copied into description. Time is never published on the
// listing, so starts_at is date-only (hard rule 5 — no invented 09:00). Category
// is left to the source row's default_categories ('family'); the adapter does not
// fabricate one per event.

import { politeFetch } from './crawl-net.js';
import { decodeEntities, stripTags } from './entities.js';
import { makeStartsAt } from './event-time.js';

const CARD_RE = /<article[^>]*class="[^"]*\bmodul-teaser\b[^"]*"[\s\S]*?<\/article>/gi;
// Citywide / no-place sentinels: real answers, but not a geocodable location →
// the event stays at the city centroid, never pinned to an invented spot.
const CITYWIDE = /^(berlinweit|stadtweit|berliner[-\s]?umland|online|verschiedene\s+orte)$/i;

// One event card → our event shape, or null if it lacks a title or a date
// (never fabricate). `base` resolves the relative detail href to an absolute
// linkback.
export function parseFamilienportalCard(card, src, base) {
  const title = stripTags((card.match(/<h3[^>]*class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || '');
  const meta = (card.match(/<p[^>]*class="[^"]*\btext--meta\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '';
  const metaText = decodeEntities(meta.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

  // Pipe-separated, fields classified by content (not position): a date, an
  // optional time, an optional Bezirk. Reading the 2nd field positionally would
  // treat "10:00 Uhr" as a place.
  const segs = metaText.split('|').map((s) => s.trim()).filter(Boolean);
  let date_start = null;
  let time_start = null;
  let place = null;
  for (const seg of segs) {
    const dm = seg.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const tm = seg.match(/^(\d{1,2}):(\d{2})(?:\s*Uhr)?$/i);
    if (dm) { date_start = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`; }
    else if (tm) { const h = tm[1].padStart(2, '0'); if (Number(h) <= 23 && Number(tm[2]) <= 59) time_start = `${h}:${tm[2]}`; }
    else if (!place) { place = seg; } // first non-date, non-time field = the Bezirk
  }
  if (!title || !date_start) return null; // no title or no date → skip, don't guess

  // The Bezirk is a town qualifier, never a venue. Citywide sentinels drop to
  // the bare city so geocodeEvent lands on the centroid, not a wrong pin.
  const town = place && !CITYWIDE.test(place) ? `${place}, ${src?.town || 'Berlin'}` : (src?.town || 'Berlin');

  const href = (card.match(/<a[^>]*class="[^"]*\bmore\b[^"]*"[^>]*href="([^"]+)"/i)
    || card.match(/href="(\/veranstaltungen[^"]*\/termin\/[^"]+)"/i) || [])[1];
  let source_url = null;
  if (href) { try { source_url = new URL(decodeEntities(href), base).toString(); } catch { /* keep null */ } }

  return {
    title,
    date_start,
    time_start, // real time when the listing states one; null (date-only) when it doesn't
    date_end: null,
    time_end: null,
    venue: null, // the listing never names a venue — Bezirk precision via town
    address: null,
    town,
    categories: [], // 'family' comes from the source row's default_categories
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    description: null,
    source_url,
    starts_at: makeStartsAt(date_start, time_start),
  };
}

function pageUrl(src, page) {
  // src.url is the human listing page (…/veranstaltungen); the result endpoint
  // is …/veranstaltungen/s with the ke_search controller + page param.
  const root = String(src.url).replace(/\/+$/, '');
  const sep = root.endsWith('/veranstaltungen') ? '/s' : '';
  return `${root}${sep}?tx_kesearch_pi1%5Bcontroller%5D=EventSearchResult&currentPage=${page}`;
}

// Walk pages until: a page has no cards, or every card on a page is past the
// horizon (list is date-ascending), or maxPages is reached. Dedup by detail URL.
export async function fetchFamilienportalEvents(src, {
  maxPages = Number(process.env.FAMILIENPORTAL_MAX_PAGES || 60),
  horizonDays = 56,
} = {}) {
  const horizon = new Date(Date.now() + horizonDays * 86400000).toISOString().slice(0, 10);
  const seen = new Set();
  const events = [];
  for (let page = 1; page <= maxPages; page++) {
    let html;
    try {
      const res = await politeFetch(pageUrl(src, page));
      if (!res.ok) break;
      html = await res.text();
    } catch { break; }

    const cards = html.match(CARD_RE) || [];
    if (!cards.length) break;

    let allPastHorizon = true;
    for (const card of cards) {
      const ev = parseFamilienportalCard(card, src, src.url);
      if (!ev) continue;
      if (ev.date_start <= horizon) allPastHorizon = false;
      if (ev.date_start > horizon) continue; // beyond the window we refresh nightly
      const key = ev.source_url || `${ev.title}|${ev.date_start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
    if (allPastHorizon) break; // ascending list has run past the horizon — done
  }
  return events;
}
