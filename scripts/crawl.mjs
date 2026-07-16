// Recrawl registered sources every few days: fetch page → structured-data-first
// extraction (JSON-LD / iCal / CMS-specific feeds / RSS) with Claude/Gemini as the fallback →
// geocode → upsert (dedup by title+day+town) → expire finished events.
// Sources are grouped by host and crawled with a bounded worker pool so different
// hosts run in parallel — the per-host ≥1s politeness delay (politeFetch) is what
// makes a single host slow, never concurrency across hosts.
// Usage: npm run crawl                    (due sources: works=1, tier != dead, cadence elapsed)
//        npm run crawl -- --url https://... (single source, ignores tier/cadence)
//        npm run crawl -- --force          (ignore page-hash change-detection)
//        npm run crawl -- --all            (ignore tier/cadence gating — periodic deep sweep)
//        npm run crawl -- --recover-zeros  (force-recrawl sources frozen at events_last=0, incl. tier=dead)
//        npm run crawl -- --scope stuttgart-40km (only that registered scope)
// Requires Claude API credentials (ANTHROPIC_API_KEY or `ant auth login`).
import { createHash } from 'node:crypto';
import {
  upsertEvent, expireFinished, getSourceByUrl, getSourcesForCrawl, getZeroYieldSources,
  markSourceCrawled, updateSourceMeta, updateSourceStats, setSourceBlockedReason,
  dedupCandidates, updateEventFields, deleteEventsByIds, closeDb,
} from '../lib/db.js';
import { geocodeEvent } from '../lib/geocode.js';
import { findDuplicate, mergePlan, titleSubstitution } from '../lib/dedup.js';
import { decodeEntities, stripTags, cleanText } from '../lib/entities.js';
import { makeStartsAt, makeEndsAt } from '../lib/event-time.js';
import { extractFromPage } from '../lib/extract.js';
import { parseDvvEvents } from '../lib/dvv-events.js';
import { parseSiteparkRssItems, siteparkIcalUrl } from '../lib/sitepark-events.js';
import { parseSindelfingenEvents, sindelfingenPageCount } from '../lib/sindelfingen-events.js';
import { decodeWpTitle, parseKreativregionIcs } from '../lib/kreativregion-events.js';
import { parseKinderfreundeEvents, kinderfreundePageCount } from '../lib/kinderfreunde-events.js';
import { parseNaturfreundeItem } from '../lib/naturfreunde-events.js';
import { parseSiteswiftEvents } from '../lib/siteswift-events.js';
import { kalkalpenDetailUrls, parseKalkalpenDetail } from '../lib/kalkalpen-events.js';
import {
  CRAWL_SCOPES, crawlScope, isWithinCrawlScope, scopeForSource,
} from '../lib/crawl-scopes.js';
import { politeFetch, robotsAllowed } from '../lib/crawl-net.js';

// One end-time builder for every adapter. Keeps a known end DATE even when the
// end TIME is unknown (date-only ends_at), and drops an end that isn't strictly
// after the start (overnight/garbled times, or a same-day range that carries no
// extra info). See lib/event-time.js makeEndsAt + expireFinished.
function endsAtOf(raw, starts_at) {
  const ends = makeEndsAt(raw.date_end, raw.time_end, raw.date_start);
  return ends && ends > starts_at ? ends : null;
}

const CAT_EMOJI = {
  family: '🎈', festival: '🎪', market: '🧺', music: '🎶',
  culture: '🎭', food: '🥨', sport: '⚽', workshop: '🎨',
};

// Cheap HTML → text: strip tags/scripts, collapse whitespace. Feeds both the
// page-hash change detection and the LLM fallback. (Restored 2026-07-14: the
// crawl-net.js extraction accidentally removed it along with the politeness
// block — every generic-shell source silently extracted zero until then.)
function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// --- structured-data-first extraction; LLM fallback stays in crawlSource ---

// Extracts a leading "YYYY-MM-DD" and optional "HH:MM" from any ISO-ish
// datetime, discarding a trailing timezone offset/Z. Hard rule: storage is
// Vienna wall-clock, never a UTC conversion — so we take the literal digits
// as written rather than parsing through Date/UTC.
function splitLocalDateTime(iso) {
  if (!iso) return { date: null, time: null };
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!m) return { date: null, time: null };
  return { date: m[1], time: m[2] || null };
}

const JSONLD_TYPE_CATEGORY = {
  musicevent: 'music', festival: 'festival', sportsevent: 'sport',
  theaterevent: 'culture', screeningevent: 'culture', exhibitionevent: 'culture',
  foodevent: 'food', childrensevent: 'family', educationevent: 'workshop', saleevent: 'market',
};
function categoryFromJsonLdType(t) {
  const types = Array.isArray(t) ? t : [t];
  for (const ty of types) {
    const cat = JSONLD_TYPE_CATEGORY[String(ty || '').toLowerCase()];
    if (cat) return [cat];
  }
  return [];
}
function isEventType(t) {
  const types = Array.isArray(t) ? t : [t];
  return types.some((ty) => /event$/i.test(String(ty || '')));
}

function collectJsonLdNodes(data, out) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data)) { for (const d of data) collectJsonLdNodes(d, out); return; }
  if (Array.isArray(data['@graph'])) { for (const d of data['@graph']) collectJsonLdNodes(d, out); }
  if (data['@type']) out.push(data);
  for (const key of ['event', 'events', 'itemListElement']) {
    if (Array.isArray(data[key])) for (const d of data[key]) collectJsonLdNodes(d, out);
  }
}

function jsonLdAddress(loc) {
  if (!loc) return { venue: null, address: null, town: null };
  if (typeof loc === 'string') return { venue: loc, address: null, town: null };
  const venue = loc.name || null;
  const addr = loc.address;
  if (typeof addr === 'string') return { venue, address: addr, town: null };
  if (addr && typeof addr === 'object') {
    return { venue, address: addr.streetAddress || null, town: addr.addressLocality || null };
  }
  return { venue, address: null, town: null };
}

function isFreeFromOffers(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  const prices = list.map((o) => (o && o.price != null ? Number(o.price) : null)).filter((p) => p != null && !Number.isNaN(p));
  if (!prices.length) return null;
  return prices.every((p) => p === 0);
}

// schema.org/Event JSON-LD → our event shape. Facts only: description is
// always null here (hard rule — never copy source prose, write our own).
function parseJsonLdEvents(html, src) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes = [];
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    collectJsonLdNodes(data, nodes);
  }
  const events = [];
  for (const n of nodes) {
    if (!isEventType(n['@type'])) continue;
    const title = n.name || null;
    const { date: date_start, time: time_start } = splitLocalDateTime(n.startDate);
    if (!title || !date_start) continue; // never fabricate: no date → skip
    const { date: date_end, time: time_end } = splitLocalDateTime(n.endDate);
    const { venue, address, town } = jsonLdAddress(n.location);
    events.push({
      title, date_start, time_start, date_end: date_end || null, time_end: time_end || null,
      venue, address, town: town || src.town || null,
      categories: categoryFromJsonLdType(n['@type']),
      is_free: isFreeFromOffers(n.offers), age_min: null, age_max: null, indoor: null,
      description: null,
      source_url: (typeof n.url === 'string' && n.url) || null,
    });
  }
  return events;
}

function findIcsLink(html) {
  const m = html.match(/href=["']([^"']*\.ics(?:\?[^"']*)?)["']/i) || html.match(/href=["'](webcal:[^"']+)["']/i);
  return m ? m[1] : null;
}

function findFeedLink(html, types) {
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (!/rel=["']alternate["']/i.test(tag)) continue;
    if (!types.some((t) => new RegExp(`type=["']${t.replace('/', '\\/')}["']`, 'i').test(tag))) continue;
    const hrefM = tag.match(/href=["']([^"']+)["']/i);
    if (hrefM) return hrefM[1];
  }
  return null;
}

function unescapeIcsText(s) {
  return (s || '').replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function icsLineValue(block, name) {
  const m = block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'im'));
  return m ? unescapeIcsText(m[1].trim()) : null;
}

// ICS date/date-time → Vienna wall-clock. Floating/TZID values are taken
// literally (Austrian sources); a trailing "Z" (true UTC instant) is the one
// case that legitimately needs a timezone conversion — done once via Intl,
// not the "now"-in-host-tz bug the hard rule warns about.
function icsDateToVienna(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { date: null, time: null };
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { date: `${y}-${mo}-${d}`, time: null };
  if (z) {
    const utcDate = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Vienna', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(utcDate);
    const g = (t) => parts.find((p) => p.type === t).value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

function icsDateValue(block, name) {
  const m = block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'im'));
  return m ? icsDateToVienna(m[1].trim()) : { date: null, time: null };
}

function parseIcsEvents(icsText, town) {
  const unfolded = icsText.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const blocks = [...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi)].map((m) => m[1]);
  const events = [];
  for (const block of blocks) {
    const title = icsLineValue(block, 'SUMMARY');
    const { date: date_start, time: time_start } = icsDateValue(block, 'DTSTART');
    if (!title || !date_start) continue; // no date → skip
    const { date: date_end, time: time_end } = icsDateValue(block, 'DTEND');
    events.push({
      title, date_start, time_start, date_end: date_end || null, time_end: time_end || null,
      venue: icsLineValue(block, 'LOCATION'), address: null, town: town || null,
      categories: [], is_free: null, age_min: null, age_max: null, indoor: null,
      description: null,
      source_url: icsLineValue(block, 'URL') || null,
    });
  }
  return events;
}

// RSS/Atom is only an event source if entries carry an explicit event-date
// tag beyond the ordinary publish date — otherwise it's a news feed, not a
// calendar, and we skip it (falls through to the LLM route).
function parseRssEvents(xml, town) {
  const items = [
    ...[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]),
    ...[...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]),
  ];
  if (!items.length) return [];
  const dateTagRe = /<(?:[\w-]+:)?(?:startdate|start-date|dtstart|eventdate|event-date)>/i;
  if (!items.some((it) => dateTagRe.test(it))) return [];

  const tag = (block, name) => {
    const m = block.match(new RegExp(`<(?:[\\w-]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, 'i'));
    return m ? unescapeIcsText(m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()) : null;
  };
  const events = [];
  for (const it of items) {
    const title = tag(it, 'title');
    const dateRaw = tag(it, 'startdate') || tag(it, 'start-date') || tag(it, 'dtstart') || tag(it, 'eventdate') || tag(it, 'event-date');
    const { date: date_start, time: time_start } = splitLocalDateTime(dateRaw);
    if (!title || !date_start) continue; // no date → skip
    events.push({
      title, date_start, time_start, date_end: null, time_end: null,
      venue: null, address: null, town: town || null,
      categories: [], is_free: null, age_min: null, age_max: null, indoor: null,
      description: null,
      source_url: tag(it, 'link') || null,
    });
  }
  return events;
}

// --- GEM2GO deterministic parser ---
// GEM2GO is one CMS template (container class "veranstaltungcmsliste") powering
// 64+ OÖ municipal sites, but its list markup has drifted across at least four
// live variants we found probing real sources: a classic RIS-style table, a
// "raster" card grid, a newer Bootstrap "bem" card list, and a collapsible
// list. Facts only — description is always null (never copy their prose);
// no photos. Categories are best-effort German keyword matching, null if
// unsure. No parseable date → skip (never fabricate). Each sub-parser is
// tried in turn; the first to yield ≥1 event wins (mirrors the JSON-LD/
// iCal/RSS waterfall above). If none match, the caller falls through to the
// LLM — this is a coverage floor, not a requirement to handle every variant.

const DE_MONTHS = {
  januar: '01', februar: '02', märz: '03', maerz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

// title/venue → category, small and best-effort (hard rule: null beats a guess).
const GEM2GO_CATEGORY_RULES = [
  [/Fest\b|Brauchtum/i, 'festival'],
  [/Konzert|Musik/i, 'music'],
  [/Markt|Flohmarkt/i, 'market'],
  [/Kinder|Familie/i, 'family'],
  [/Ausstellung|Theater/i, 'culture'],
  [/\bLauf\b|Turnier|\bSport/i, 'sport'],
  [/Workshop|\bKurs\b|Seminar/i, 'workshop'],
  [/Kulinarik|Kulinarisch/i, 'food'],
];
function categorizeGem2go(text) {
  for (const [re, cat] of GEM2GO_CATEGORY_RULES) if (re.test(text)) return [cat];
  return [];
}
function freeFromText(text) {
  return /kostenlos|gratis|eintritt frei/i.test(text || '') ? true : null;
}

function absUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}
function timeRangeFrom(text) {
  const m = (text || '').match(/(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?/);
  return { time_start: m ? m[1] : null, time_end: m && m[2] ? m[2] : null };
}

// Variant 1: classic RIS-style table (<table class="... ris_table">), rows
// class="odd"/"even" with three <td class="td_va"> cells: date[/time], title
// link, venue (plain text, address with <br>, or a venue link).
function parseGem2goTable(html, src) {
  const rows = [...html.matchAll(/<tr class="\s*(?:odd|even)">([\s\S]*?)<\/tr>/gi)];
  const events = [];
  for (const [, row] of rows) {
    const cells = [...row.matchAll(/<td class="td_va"[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 2) continue;
    const [dateCell, titleCell, venueCell] = cells;
    const dates = [...dateCell.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)];
    if (!dates.length) continue; // never fabricate: no date → skip
    const [, d1, m1, y1] = dates[0];
    const date_start = `${y1}-${m1}-${d1}`;
    let date_end = null;
    if (dates.length > 1) { const [, d2, m2, y2] = dates[1]; date_end = `${y2}-${m2}-${d2}`; }
    const { time_start, time_end } = timeRangeFrom(dateCell);

    const linkMatch = titleCell && titleCell.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const title = stripTags(linkMatch[2]);
    if (!title) continue;

    let venue = null;
    if (venueCell) {
      const venueLink = venueCell.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
      venue = stripTags(venueLink ? venueLink[1] : venueCell) || null;
    }

    events.push({
      title, date_start, time_start, date_end, time_end,
      venue, address: null, town: src.town || null,
      categories: categorizeGem2go(title), is_free: freeFromText(title), age_min: null, age_max: null, indoor: null,
      description: null, source_url: absUrl(linkMatch[1], src.url),
    });
  }
  return events;
}

// Variant 2: "raster" card grid, div.rasterListEntry siblings each closed by
// a literal "<div class=\"clear\"></div></div>". German long-form dates
// ("27. Juli 2026") — needs the month-name table above.
function parseGem2goRaster(html, src) {
  const entries = [...html.matchAll(/<div class="(?:odd|even) rasterListEntry">([\s\S]*?)<div class="clear"><\/div><\/div>/gi)];
  const events = [];
  for (const [, entry] of entries) {
    const linkMatch = entry.match(/rasterListInfoContainerTitel"><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const title = stripTags(linkMatch[2]);
    if (!title) continue;

    const dateMatch = entry.match(/rasterListDateContainerDateTime">([^<]+)</i);
    const dm = dateMatch && dateMatch[1].match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(\d{4})/);
    if (!dm) continue; // never fabricate: no date → skip
    const month = DE_MONTHS[dm[2].toLowerCase()];
    if (!month) continue;
    const date_start = `${dm[3]}-${month}-${dm[1].padStart(2, '0')}`;

    const timeMatch = entry.match(/rasterListDateContainerTime">([^<]+)</i);
    const { time_start, time_end } = timeRangeFrom(timeMatch ? timeMatch[1] : '');

    const venueMatch = entry.match(/rasterListOrtContainerVeranstaltungsort">([^<]+)</i)
      || entry.match(/rasterListOrtContainerStaette"><a[^>]*>([^<]+)<\/a>/i);
    const addrMatch = entry.match(/rasterListOrtContainerAdresse">([\s\S]*?)<\/p>/i);

    events.push({
      title, date_start, time_start, date_end: null, time_end,
      venue: venueMatch ? stripTags(venueMatch[1]) : null,
      address: addrMatch ? stripTags(addrMatch[1].replace(/<br\s*\/?>/gi, ', ')) : null,
      town: src.town || null,
      categories: categorizeGem2go(title), is_free: freeFromText(title), age_min: null, age_max: null, indoor: null,
      description: null, source_url: absUrl(linkMatch[1], src.url),
    });
  }
  return events;
}

// Variant 3: newer Bootstrap "bem" card list (div.bemCardContainer). No
// clean regex close marker (nested picture/img markup varies), so entries
// are split on the container's opening literal instead — safe here because
// every field we read appears near the top of each card.
function parseGem2goBem(html, src) {
  const chunks = html.split('<div class="bemCardContainer').slice(1);
  const events = [];
  for (const chunk of chunks) {
    const titleMatch = chunk.match(/bemHeader bemHeader--h5[^"]*">([^<]+)</i);
    if (!titleMatch) continue;
    const title = stripTags(titleMatch[1]);
    if (!title) continue;

    const linkMatch = chunk.match(/<a href="([^"]+)"/i);

    const dateMatch = chunk.match(/bemContainer--date[^"]*">[\s\S]*?<\/abbr>,\s*(\d{2})\.(\d{2})\.(\d{4})/i);
    if (!dateMatch) continue; // never fabricate: no date → skip
    const date_start = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

    const timeBlockMatch = chunk.match(/bemContainer--time[^"]*">([\s\S]*?)<\/div>/i);
    const { time_start, time_end } = timeRangeFrom(timeBlockMatch ? timeBlockMatch[1] : '');

    const venueMatch = chunk.match(/Veranstaltungsstätte"[\s\S]{0,80}?bemText__value">(?:<a[^>]*>)?([^<]+)/i);
    const addrMatch = chunk.match(/fa-map-marker-alt[\s\S]{0,120}?bemText__value">([^<]+)/i);

    events.push({
      title, date_start, time_start, date_end: null, time_end,
      venue: venueMatch ? stripTags(venueMatch[1]) : null,
      address: addrMatch ? stripTags(addrMatch[1]) : null,
      town: src.town || null,
      categories: categorizeGem2go(title), is_free: freeFromText(title), age_min: null, age_max: null, indoor: null,
      description: null, source_url: linkMatch ? absUrl(linkMatch[1], src.url) : null,
    });
  }
  return events;
}

// Variant 4: collapsible accordion list (div.vaCollapsibleListItem). Split
// on the opening literal, same rationale as the bem variant.
function parseGem2goCollapsible(html, src) {
  const chunks = html.split('<div class="vaCollapsibleListItem">').slice(1);
  const events = [];
  for (const chunk of chunks) {
    const titleMatch = chunk.match(/vaCollapsibleListItem-title"><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const title = stripTags(titleMatch[2]);
    if (!title) continue;

    const dateMatch = chunk.match(/vaCollapsibleListItem-datumDatum">(\d{2})\.(\d{2})\.(\d{4})/i);
    if (!dateMatch) continue; // never fabricate: no date → skip
    const date_start = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

    const timeMatch = chunk.match(/vaCollapsibleListItem-datumUhrzeit">(\d{2}:\d{2})/i);
    const venueMatch = chunk.match(/vaCollapsibleListItem-adresseOrt">,?\s*([^<]+)</i);
    const gemeindeMatch = chunk.match(/vaCollapsibleListItem-adresseGemeinde">([^<]*)</i);

    events.push({
      title, date_start, time_start: timeMatch ? timeMatch[1] : null, date_end: null, time_end: null,
      venue: venueMatch ? stripTags(venueMatch[1]) : null, address: null,
      town: (gemeindeMatch && gemeindeMatch[1].trim()) || src.town || null,
      categories: categorizeGem2go(title), is_free: freeFromText(title), age_min: null, age_max: null, indoor: null,
      description: null, source_url: absUrl(titleMatch[1], src.url),
    });
  }
  return events;
}

function parseGem2goEvents(html, src) {
  for (const parser of [parseGem2goTable, parseGem2goBem, parseGem2goRaster, parseGem2goCollapsible]) {
    const events = parser(html, src);
    if (events.length) return events;
  }
  return [];
}

// --- wien.gv.at "Wien erleben" (cms='wien-erleben') — the city's official
// events aggregator. Its listing/category pages (registered as sources) are
// teaser cards only — the actual schema.org/Event JSON-LD lives on each
// event's own detail page, in a non-standard dialect the generic parseJsonLdEvents
// doesn't match (no top-level startDate — recurring occurrences live in a
// `subEvent[]` array; address is `addresses[]` not `location`). So this is a
// genuine two-hop structured route: collect detail links from the given page,
// politeFetch each (same host, same politeness queue as everything else),
// pull the Event node(s) out. Capped so one source's crawl can't run away.
const WIEN_DETAIL_CAP = 40;
function wienJsonLdAddress(n) {
  const a = Array.isArray(n.addresses) ? n.addresses[0] : null;
  if (!a) return { address: null };
  return { address: a.street ? a.street.trim() : null };
}
function parseWienErlebenEventNode(n, pageUrl, src) {
  // Never trust addressLocality for the town field — this dialect's own data
  // renders it in English ("Vienna"), inconsistent with our German-name
  // convention elsewhere ("Wien"). Every event on this source is Vienna
  // anyway (src.town is fixed at registration), so always use that instead.
  const { address } = wienJsonLdAddress(n);
  const props = Array.isArray(n.additionalProperty) ? n.additionalProperty : [];
  const kidTag = props.some((p) => p && p.value === true && /kind/i.test(String(p.name || '')));
  const base = {
    title: n.name || null,
    venue: null, address, town: src.town || null,
    categories: kidTag ? ['family'] : [],
    is_free: typeof n.isAccessibleForFree === 'boolean' ? n.isAccessibleForFree : null,
    age_min: null, age_max: null, indoor: null,
    description: null,
    source_url: pageUrl,
  };
  const occurrences = Array.isArray(n.subEvent) && n.subEvent.length ? n.subEvent : [n];
  const out = [];
  for (const occ of occurrences) {
    const { date: date_start, time: time_start } = splitLocalDateTime(occ.startDate);
    if (!base.title || !date_start) continue; // never fabricate: no date → skip
    const { date: date_end, time: time_end } = splitLocalDateTime(occ.endDate);
    out.push({ ...base, date_start, time_start, date_end: date_end || null, time_end: time_end || null });
  }
  return out;
}
async function parseWienErlebenEvents(html, src) {
  const hrefs = [...html.matchAll(/href="(https:\/\/www\.wien\.gv\.at\/veranstaltungen\/[a-z0-9-]+)"/gi)].map((m) => m[1]);
  const uniq = [...new Set(hrefs)].slice(0, WIEN_DETAIL_CAP);
  const events = [];
  for (const url of uniq) {
    try {
      if (!(await robotsAllowed(url))) continue;
      const res = await politeFetch(url);
      if (!res.ok) continue;
      const detailHtml = await res.text();
      const blocks = [...detailHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      for (const b of blocks) {
        let data;
        try { data = JSON.parse(b[1].trim()); } catch { continue; }
        const nodes = [];
        collectJsonLdNodes(data, nodes);
        for (const n of nodes) {
          if (!isEventType(n['@type'])) continue;
          events.push(...parseWienErlebenEventNode(n, url, src));
        }
      }
    } catch { /* one bad detail page must not break the rest */ }
  }
  return events;
}

// The Stuttgart adapters (lib/sindelfingen-events.js, lib/kreativregion-events.js)
// were written for the one-shot mine-*.mjs scripts and speak the seed-file shape.
// Map it onto the crawl shape rather than forking the parsers.
function fromMinedShape(ev) {
  return {
    ...ev,
    description: ev.description_short ?? null,
    address: ev.address_text ?? null,
  };
}

// TYPO3 "hwveranstaltung" result list (Stadt Sindelfingen): a paginated set of
// result cards at /seite-N/. Page 1 is the registered source URL, already fetched.
async function parseHwVeranstaltungEvents(html, src) {
  const events = parseSindelfingenEvents(html);
  if (!/\/seite-\d+\//.test(src.url)) return events; // no pager in the URL → single page
  const pages = Math.min(sindelfingenPageCount(html), 100);
  for (let page = 2; page <= pages; page++) {
    const url = src.url.replace(/\/seite-\d+\//, `/seite-${page}/`);
    try {
      if (!await robotsAllowed(url)) break;
      const res = await politeFetch(url);
      if (!res.ok) break;
      events.push(...parseSindelfingenEvents(await res.text()));
    } catch { break; } // a broken page N must not discard pages 1..N-1
  }
  return events;
}

// Kinderfreunde Österreich events listing (server-rendered HTML cards,
// paginated 10/page via "?partial=0&pe=N"). Page 1 is the registered source
// URL, already fetched; walk the rest politely.
async function parseKinderfreundeSource(html, src) {
  const events = parseKinderfreundeEvents(html, src.url);
  const pages = Math.min(kinderfreundePageCount(html), 50);
  for (let page = 2; page <= pages; page++) {
    const url = `${src.url}?partial=0&pe=${page}`;
    try {
      if (!await robotsAllowed(url)) break;
      const res = await politeFetch(url);
      if (!res.ok) break;
      events.push(...parseKinderfreundeEvents(await res.text(), src.url));
    } catch { break; } // a broken page N must not discard pages 1..N-1
  }
  return events;
}

// WordPress `dmwpevents` post type + per-event iCal export (Kreativregion
// Stuttgart). The registered source URL is the REST collection; each record's
// canonical link is the linkback and its iCal export carries the dated facts.
async function parseWordpressIcalEvents(src) {
  const origin = new URL(src.url).origin;
  const records = [];
  for (let page = 1; page <= 5; page++) {
    const listUrl = new URL(src.url);
    listUrl.searchParams.set('per_page', '100');
    listUrl.searchParams.set('page', String(page));
    listUrl.searchParams.set('_fields', 'id,link,title');
    const res = await politeFetch(listUrl.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    records.push(...batch);
    if (batch.length < 100) break;
  }

  const events = [];
  for (const rec of records) {
    if (!Number.isInteger(rec?.id) || !rec?.link) continue;
    try {
      const icsUrl = `${origin}/feed/calendar/?id=${rec.id}`;
      if (!await robotsAllowed(icsUrl)) continue;
      const res = await politeFetch(icsUrl, { headers: { Accept: 'text/calendar' } });
      if (!res.ok) continue;
      const ev = parseKreativregionIcs(await res.text(), {
        title: decodeWpTitle(rec.title?.rendered), source_url: rec.link,
      });
      // This source covers a wider area than the 40 km scope (Brussels, Heilbronn,
      // online). An event whose facts name no town would inherit src.town below —
      // i.e. get pinned in Stuttgart on no evidence. Drop it instead.
      if (ev?.town) events.push(ev);
    } catch { /* one broken calendar record must not abort the source */ }
  }
  return events;
}

// Nationalpark Kalkalpen (cms='kalkalpen'): the registered source URL is the
// site's sitemap.xml (veranstaltungskalender itself is a JS-only Contao
// widget with no server-rendered events). Two-hop, like wien-erleben above:
// the "html" the generic shell already fetched IS the sitemap text; filter it
// to /veranstaltung/<slug> locs, then politeFetch each detail page (same
// host, same politeness queue). Capped well above the ~71 pages seen live so
// legitimate growth doesn't silently truncate.
const KALKALPEN_DETAIL_CAP = 80;
async function parseKalkalpenSource(sitemapXml, src) {
  const urls = kalkalpenDetailUrls(sitemapXml).slice(0, KALKALPEN_DETAIL_CAP);
  const events = [];
  for (const url of urls) {
    try {
      if (!(await robotsAllowed(url))) continue;
      const res = await politeFetch(url);
      if (!res.ok) continue;
      events.push(...parseKalkalpenDetail(await res.text(), url));
    } catch { /* one broken detail page must not break the rest */ }
  }
  return events.map((ev) => ({ ...ev, town: ev.town || src.town || null }));
}

// Waterfall: JSON-LD → iCal → wien-erleben (cms-gated, two-hop) → GEM2GO
// (cms-gated) → siteswift (cms-gated) → kalkalpen (cms-gated, two-hop) → DVV
// hCalendar RSS (cms-gated) → sitepark/hwveranstaltung/wordpress-ical/
// kinderfreunde (cms-gated) → generic RSS/Atom. First route
// that yields ≥1 valid event wins and the LLM call is skipped entirely.
// (Naturfreunde is not in this waterfall — its registered source URL is a
// POST-only JSON API that returns nothing meaningful on a plain GET, so it's
// special-cased at the top of crawlSource() instead, see
// crawlNaturfreundeSource() below.)
async function tryStructuredExtraction(html, src) {
  const jsonld = parseJsonLdEvents(html, src);
  if (jsonld.length) return { route: 'jsonld', events: jsonld };

  const icsHref = findIcsLink(html);
  if (icsHref) {
    try {
      const icsUrl = new URL(icsHref.replace(/^webcal:/i, 'https:'), src.url).toString();
      const res = await politeFetch(icsUrl);
      if (res.ok) {
        const icsEvents = parseIcsEvents(await res.text(), src.town);
        if (icsEvents.length) return { route: 'ical', events: icsEvents };
      }
    } catch { /* fall through */ }
  }

  if (src.cms === 'wien-erleben') {
    const wienEvents = await parseWienErlebenEvents(html, src);
    if (wienEvents.length) return { route: 'jsonld', events: wienEvents };
  }

  if (src.cms === 'gem2go') {
    const gem2goEvents = parseGem2goEvents(html, src);
    if (gem2goEvents.length) return { route: 'gem2go', events: gem2goEvents };
  }

  if (src.cms === 'siteswift') {
    const siteswiftEvents = parseSiteswiftEvents(html, src);
    if (siteswiftEvents.length) return { route: 'siteswift', events: siteswiftEvents };
  }

  if (src.cms === 'kalkalpen') {
    const kalkalpenEvents = await parseKalkalpenSource(html, src);
    if (kalkalpenEvents.length) return { route: 'kalkalpen', events: kalkalpenEvents };
  }

  if (src.cms === 'dvv') {
    const dvvEvents = parseDvvEvents(html, src);
    if (dvvEvents.length) return { route: 'dvv', events: dvvEvents };
  }

  if (src.cms === 'sitepark-ical') {
    const events = [];
    for (const item of parseSiteparkRssItems(html)) {
      try {
        const icsUrl = siteparkIcalUrl(item.detailUrl);
        if (!await robotsAllowed(icsUrl)) continue;
        const res = await politeFetch(icsUrl);
        if (!res.ok) continue;
        events.push(...parseIcsEvents(await res.text(), src.town));
      } catch { /* one broken calendar item must not abort the source */ }
    }
    if (events.length) return { route: 'ical', events };
  }

  if (src.cms === 'typo3-hwveranstaltung') {
    const events = await parseHwVeranstaltungEvents(html, src);
    if (events.length) return { route: 'hwveranstaltung', events: events.map(fromMinedShape) };
  }

  if (src.cms === 'kinderfreunde') {
    const events = await parseKinderfreundeSource(html, src);
    if (events.length) return { route: 'kinderfreunde', events };
  }

  if (src.cms === 'wordpress-ical') {
    const events = await parseWordpressIcalEvents(src);
    if (events.length) return { route: 'wordpress-ical', events: events.map(fromMinedShape) };
  }

  const feedHref = findFeedLink(html, ['application/rss+xml', 'application/atom+xml']);
  if (feedHref) {
    try {
      const feedUrl = new URL(feedHref, src.url).toString();
      const res = await politeFetch(feedUrl);
      if (res.ok) {
        const rssEvents = parseRssEvents(await res.text(), src.town);
        if (rssEvents.length) return { route: 'rss', events: rssEvents };
      }
    } catch { /* fall through */ }
  }

  return { route: null, events: [] };
}

// --- source content-rating / tiering ---
// Tier thresholds (tunable — the only place they're defined):
//  - dead:    zero_streak >= 4 (fetch failures / robots-blocks / thin pages count
//             toward this too, same as a real extraction round finding nothing)
//             → excluded from default runs (getSourcesForCrawl), --all overrides.
//  - active:  avg yield (events_sum / crawl_count) >= 1.5, OR the page changed in
//             the last 3 days → recrawl every 2 days.
//  - slow:    avg yield >= 0.3 → recrawl every 5 days.
//  - dormant: everything else that still works (low/no yield, rarely changes)
//             → recrawl every 7 days.
// New sources (crawl_count < 3) default to 'active' — not enough data yet to
// demote them, and we want a fair first look before judging yield.
// A hash-unchanged round only bumps crawl_count (an attempt happened) — it does
// NOT bump zero_streak, because "page didn't change" is a normal, healthy state
// for a slow municipal calendar and isn't the same signal as "found nothing".
// Exported so scripts/rot-report.mjs reads the SAME thresholds rather than a
// second hand-copied object that can silently drift from these numbers.
export const TIER_CADENCE_DAYS = { active: 2, slow: 5, dormant: 7 };
function deriveTier({ crawl_count, events_sum, zero_streak, last_changed }) {
  if (zero_streak >= 4) return 'dead';
  if (crawl_count < 3) return 'active';
  const avgYield = events_sum / crawl_count;
  const daysSinceChange = last_changed ? (Date.now() - new Date(last_changed).getTime()) / 86400000 : Infinity;
  if (avgYield >= 1.5 || daysSinceChange <= 3) return 'active';
  if (avgYield >= 0.3) return 'slow';
  return 'dormant';
}
function isDue(src) {
  if (!src.last_crawled) return true;
  const cadence = TIER_CADENCE_DAYS[src.tier] ?? TIER_CADENCE_DAYS.active;
  const daysSince = (Date.now() - new Date(src.last_crawled).getTime()) / 86400000;
  return daysSince >= cadence;
}
// Folds this crawl's outcome into the source's running stats, re-derives its
// tier, and persists both. `outcome.type`: 'unchanged' (hash-skip — neutral),
// 'noContent' (fetch failed / robots-blocked / page too thin — counts as a
// zero_streak hit), or 'extracted' (real extraction round, with eventsFound).
async function recordStats(src, outcome) {
  const crawl_count = (src.crawl_count || 0) + 1;
  let events_last = src.events_last ?? 0;
  let events_sum = src.events_sum || 0;
  let zero_streak = src.zero_streak || 0;
  let last_changed = src.last_changed || null;

  if (outcome.type === 'extracted') {
    events_last = outcome.eventsFound;
    events_sum += outcome.eventsFound;
    zero_streak = outcome.eventsFound > 0 ? 0 : zero_streak + 1;
    last_changed = new Date();
  } else if (outcome.type === 'noContent') {
    events_last = 0;
    zero_streak += 1;
  } // 'unchanged': only crawl_count advances

  const stats = { crawl_count, events_last, events_sum, zero_streak, last_changed };
  const tier = deriveTier(stats);
  await updateSourceStats(src.id, { ...stats, tier });
  return tier;
}

// --- Naturfreunde Österreich (cms='naturfreunde') ---
// A hidden JSON API (POST /events/ng_items), not an HTML page: a plain GET on
// the registered source URL returns a content-free `{"status":"ok"}` stub, so
// this source can't flow through crawlSource()'s generic GET → thin-page →
// hash-compare → tryStructuredExtraction() shell like every other source —
// there is no meaningful "page" to hash there, and a hash of that stub would
// never change, permanently wedging change-detection on the wrong signal.
// Special-cased end-to-end instead: own fetch/pagination, own hash (over the
// fetched item set, not a page), own upsert loop. Filtered server-side to the
// two family-relevant target groups (ids discovered via POST /events/ng_basedata
// — "Angebote für Familien" / "Angebote für Kinder & Jugendliche"; the plain
// `ng_items` response ignores a leading underscore on these ids, e.g.
// targetgroupid must be "1956" not "_1956") rather than the full ~2,491-event,
// 312-page catalog across all Bundesländer.
const NF_TARGET_GROUPS = [
  { id: '1956', label: 'Familien' },
  { id: '9000', label: 'Kinder & Jugendliche' },
];
const NF_PAGE_CAP = 60; // safety cap per target group (well above the ~26 pages each currently yields)

async function fetchNaturfreundeEvents(src) {
  const seen = new Map(); // ev_id -> event; the two target-group queries can overlap
  const hashParts = [];
  for (const tg of NF_TARGET_GROUPS) {
    let page = 1, totalPages = 1;
    do {
      const res = await politeFetch(src.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetgroupid: tg.id, page }),
      });
      if (!res.ok) break;
      const data = await res.json();
      if (data.status !== 'ok') break;
      totalPages = Math.min(data.items_pagination?.total_pages || 1, NF_PAGE_CAP);
      for (const item of data.items || []) {
        hashParts.push(`${item.ev_id}|${item.date_str}|${item.lat ?? ''}|${item.lon ?? ''}`);
        if (seen.has(item.ev_id)) continue;
        const ev = parseNaturfreundeItem(item, src.url);
        if (ev) seen.set(item.ev_id, ev);
      }
      page += 1;
    } while (page <= totalPages);
  }
  return { events: [...seen.values()], hashParts };
}

// --- blocked_reason (docs/design/big-city-quality.md §2) ---
// A robots-disallow (or a hand/fingerprint-sweep-set js_spa/ai_bot_policy/
// bot_block) is a STATE, not a failure streak: it must never feed zero_streak
// or nudge a source toward tier='dead' the way an ordinary zero-event round
// does (the Stuttgart lesson, tasks/lessons.md 2026-07-14 — a robots skip was
// silently counted the same as "found nothing").
async function clearBlockedIfSet(src) {
  if (src.blocked_reason) await setSourceBlockedReason(src.id, null);
}

// Crawl-time fuzzy cross-source dedup (docs/design/data-pipeline.md §6): a
// FALLBACK for when upsertEvent()'s exact content_hash/legacy/placeholder
// match already MISSED — i.e. `ev` was just inserted as a brand-new row. Two
// sources describing the same real event in different words (a Grok-mined
// phrasing vs. a Gemini recrawl, an aggregator vs. the municipality itself)
// slip past the exact hash but should still collapse into one map pin rather
// than showing twice. Bounded to ONE query (same day + town, mirroring how
// app/api/events/route.js and app/api/scan/route.js already use findDuplicate)
// instead of loading every published event per candidate.
async function tryFuzzyMerge(ev) {
  const day = (ev.starts_at || '').slice(0, 10);
  // cleanText mirrors the write boundary (lib/db.js upsertEvent) — the row we
  // are comparing against was stored post-cleanText, so an un-decoded "&#8211;"
  // in `ev.title` would fail titlesMatch against an already-clean stored title.
  const title = cleanText(ev.title);
  const town = cleanText(ev.town);
  if (!day || !town) return false; // nothing to bound the query on — skip
  const candidates = await dedupCandidates(day, town, ev.id);
  if (!candidates.length) return false;
  const match = findDuplicate({ ...ev, title, town }, candidates);
  if (!match) return false;
  // Stricter bar than the scan/API paths: THIS merge is automatic and
  // destructive (deletes the just-inserted row, no review UI, no dry run), so
  // a template-title near-match that substitutes one content word for another
  // ("Josefstadt spielt" ↔ "Meidling spielt" — different districts, same
  // boilerplate, both at town precision) must bail rather than delete a real
  // event. Hard rule 5's corollary: destroying a true event is as bad as
  // inventing one.
  if (titleSubstitution(match.title, title)) return false;
  // Enrich-only (fill nulls, never overwrite a fact — see lib/dedup.js
  // mergePlan), and source_url/source_name are excluded from the patch, so the
  // surviving row keeps the FIRST-SEEN source's attribution, never fabricated.
  const patch = mergePlan(match, { ...ev, title, town });
  if (Object.keys(patch).length) await updateEventFields(match.id, patch);
  await deleteEventsByIds([ev.id]); // the row we just inserted was the duplicate
  return true;
}

async function crawlNaturfreundeSource(src, { force } = {}) {
  console.log(`\n→ ${src.name} (${src.url})`);

  // 'robots' is re-derived by THIS crawl's own check every run (below), so it
  // clears itself the moment the site's policy changes. Any OTHER reason
  // (js_spa/ai_bot_policy/bot_block) is set by hand or by the CMS fingerprint
  // sweep, never auto-detected here — respect it and skip without an attempt.
  if (src.blocked_reason && src.blocked_reason !== 'robots') {
    console.log(`  blocked (${src.blocked_reason}), skipping`);
    return { ok: 0, fail: 0 };
  }

  try {
    if (!(await robotsAllowed(src.url))) {
      console.log('  robots.txt disallows this path, skipping');
      await setSourceBlockedReason(src.id, 'robots');
      // Blocked is a STATE, not a failure streak (tasks/lessons.md 2026-07-14):
      // leave crawl stats untouched entirely, same treatment as a provider
      // error — no zero_streak bump, no tier nudge.
      return { ok: 0, fail: 0 };
    }
  } catch { /* robots check itself failed → default allow, proceed */ }

  let events, hashParts;
  try {
    ({ events, hashParts } = await fetchNaturfreundeEvents(src));
  } catch (e) {
    console.log(`  fetch failed: ${e.message}`);
    const tier = await recordStats(src, { type: 'noContent' });
    return { ok: 0, fail: 0, fetchError: true, tier, attempted: true };
  }
  await clearBlockedIfSet(src); // reachable → whatever blocked it before is gone

  const hash = createHash('sha256').update(hashParts.slice().sort().join('\n')).digest('hex');
  if (!force && src.page_hash && src.page_hash === hash) {
    console.log('  unchanged, skipped');
    const tier = await recordStats(src, { type: 'unchanged' });
    return { ok: 0, fail: 0, tier };
  }

  let ok = 0, fuzzyMerged = 0;
  for (const raw of events) {
    try {
      // Same source-level default categories as the generic path (see there).
      const cats = [...new Set([...raw.categories, ...(src.default_categories || [])])]
        .filter((c) => CAT_EMOJI[c]);
      const ev = {
        title: raw.title,
        description: null,
        // The Naturfreunde JSON carries no time-of-day at all. That is "unknown",
        // not "all day" — store the date alone and claim nothing (lib/event-time.js).
        starts_at: makeStartsAt(raw.date_start, null),
        // A multi-day Naturfreunde range (date_start..date_end, no times) keeps
        // its end DATE — dropping it would expire a multi-day tour after day one.
        ends_at: endsAtOf(raw, makeStartsAt(raw.date_start, null)),
        all_day: 0,
        venue: raw.venue, address: raw.address, town: raw.town,
        categories: cats,
        is_free: raw.is_free, age_min: raw.age_min, age_max: raw.age_max, indoor: raw.indoor,
        emoji: CAT_EMOJI[cats[0]] || '📌',
        src_kind: 'crawl',
        source_name: src.name,
        source_url: raw.source_url,
        country: 'AT',
      };
      // Coordinates come straight from the source (parser-supplied, verified
      // per-item in parseNaturfreundeItem) — skip geocoding entirely, mirroring
      // how scripts/seed.mjs honors mined lat/lng.
      const res = await upsertEvent({ ...ev, lat: raw.lat, lng: raw.lng, geo_precision: 'venue' });
      ok++;
      // Fuzzy cross-source dedup is a FALLBACK for when the exact content_hash/
      // legacy match above already missed (res.updated === false means a brand
      // new row was just inserted) — see tryFuzzyMerge.
      if (!res.updated && await tryFuzzyMerge({ ...ev, id: res.id, lat: raw.lat, lng: raw.lng, geo_precision: 'venue' })) {
        fuzzyMerged++;
      }
    } catch (e) {
      console.log(`  ! skip event "${raw.title || '(untitled)'}" (${src.name}): ${e.code || e.message}`);
    }
  }
  console.log(`  ${ok}/${events.length} events upserted (route: naturfreunde)`
    + (fuzzyMerged ? `, ${fuzzyMerged} fuzzy-merged` : ''));
  await updateSourceMeta(src.id, { page_hash: hash, feed_kind: 'naturfreunde' });
  const tier = await recordStats(src, { type: 'extracted', eventsFound: ok });
  return { ok, fail: 0, tier, attempted: true, fuzzyMerged };
}

async function crawlSource(src, { force, scope: requestedScope } = {}) {
  if (src.cms === 'naturfreunde') return crawlNaturfreundeSource(src, { force });

  const scope = requestedScope || scopeForSource(src);
  console.log(`\n→ ${src.name} (${src.url})`);

  // 'robots' is re-derived by THIS crawl's own check every run (below), so it
  // clears itself the moment the site's policy changes. Any OTHER reason
  // (js_spa/ai_bot_policy/bot_block) is set by hand or by the CMS fingerprint
  // sweep, never auto-detected here — respect it and skip without an attempt.
  if (src.blocked_reason && src.blocked_reason !== 'robots') {
    console.log(`  blocked (${src.blocked_reason}), skipping`);
    return { ok: 0, fail: 0 };
  }

  try {
    if (!(await robotsAllowed(src.url))) {
      console.log('  robots.txt disallows this path, skipping');
      await setSourceBlockedReason(src.id, 'robots');
      // Blocked is a STATE, not a failure streak (tasks/lessons.md 2026-07-14):
      // leave crawl stats untouched entirely, same treatment as a provider
      // error — no zero_streak bump, no tier nudge.
      return { ok: 0, fail: 0 };
    }
  } catch { /* robots check itself failed → default allow, proceed */ }

  // Conditional GET: send back whatever caching headers the last 200 gave us.
  // A 304 means the server itself confirms nothing changed — cheaper than the
  // page_hash compare below (that still pays for the full download) and
  // handled identically: 'unchanged' stats, early return, page_hash/etag/
  // last_modified all left as they already are in the DB.
  let html, res;
  try {
    const condHeaders = {};
    if (src.etag) condHeaders['If-None-Match'] = src.etag;
    if (src.last_modified) condHeaders['If-Modified-Since'] = src.last_modified;
    res = await politeFetch(src.url, Object.keys(condHeaders).length ? { headers: condHeaders } : {});
    if (res.status === 304) {
      console.log('  304 not modified, skipped');
      await clearBlockedIfSet(src); // reachable → whatever blocked it before is gone
      const tier = await recordStats(src, { type: 'unchanged' });
      return { ok: 0, fail: 0, tier };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.log(`  fetch failed: ${e.message}`);
    const tier = await recordStats(src, { type: 'noContent' });
    return { ok: 0, fail: 0, fetchError: true, tier, attempted: true };
  }
  await clearBlockedIfSet(src); // reachable → whatever blocked it before is gone
  const text = htmlToText(html);
  if (text.length < 200) {
    console.log('  page too thin, skipping');
    const tier = await recordStats(src, { type: 'noContent' });
    return { ok: 0, fail: 0, tier, attempted: true };
  }

  const hash = createHash('sha256').update(text).digest('hex');
  if (!force && src.page_hash && src.page_hash === hash) {
    console.log('  unchanged, skipped');
    const tier = await recordStats(src, { type: 'unchanged' });
    return { ok: 0, fail: 0, tier };
  }

  let events, route;
  const structured = await tryStructuredExtraction(html, src);
  if (structured.events.length) {
    ({ events, route } = structured);
    console.log(`  structured route: ${route} (${events.length} candidate event(s))`);
  } else {
    route = 'llm';
    try {
      events = await extractFromPage({ text, sourceName: src.name, town: src.town });
    } catch (e) {
      // A provider failure (429 storm, outage, missing key) says nothing about
      // the SOURCE. Recording it as noContent zeroed events_last and bumped
      // zero_streak, so one bad Gemini night froze hundreds of healthy sources
      // at 0 (and 4 rotted to tier=dead). Leave stats and page_hash untouched
      // and signal the caller to skip last_crawled, so the source stays due
      // and retries on the next run.
      console.log(`  extraction failed (provider, source stats untouched): ${e.message}`);
      return { ok: 0, fail: 1, extractError: true, attempted: true };
    }
  }

  let ok = 0, outsideScope = 0, fuzzyMerged = 0;
  for (const raw of events) {
    try {
      if (!raw.title || !raw.date_start) continue;
      const time = /^\d{2}:\d{2}$/.test(raw.time_start || '') ? raw.time_start : null;
      const starts_at = makeStartsAt(raw.date_start, time);
      // Keep a known end DATE even when the end time is unknown (date-only
      // ends_at) — dropping it expired multi-day ranges after their first day.
      const ends_at = endsAtOf(raw, starts_at);
      const ev = {
        title: raw.title,
        description: raw.description || null,
        starts_at,
        ends_at,
        // NOT `time ? 0 : 1`. A missing time means the source said nothing about
        // when this starts — it does not mean the event runs all day. Claiming
        // "ganztägig" tells a parent they can turn up whenever, which for a 16:00
        // screening is false. Unknown stays unknown (lib/event-time.js).
        all_day: 0,
        venue: raw.venue, address: raw.address, town: raw.town || src.town,
        // A source's default_categories are facts about the SOURCE, not guesses
        // about the text: everything a children's museum publishes is for
        // children, even when the event's own words never say so (a FRida & freD
        // listing reading "Stille Stunden — Inklusives Programm" extracted as
        // 'culture', leaving 144 kids-museum events invisible to the For-kids
        // filter). Appended, never substituted — the extractor's own categories
        // stand. Only set for unambiguously single-audience sources; see
        // scripts/migrate-source-categories.mjs.
        categories: [...new Set([
          ...(raw.categories || []),
          ...(src.default_categories || []),
        ])].filter((c) => CAT_EMOJI[c]),
        is_free: raw.is_free, age_min: raw.age_min, age_max: raw.age_max, indoor: raw.indoor,
        emoji: CAT_EMOJI[(raw.categories || [])[0]] || CAT_EMOJI[(src.default_categories || [])[0]] || '📌',
        src_kind: 'crawl',
        source_name: src.name,
        source_url: raw.source_url || src.url,
        // Inherit the source's country so geocodeEvent uses the right Nominatim
        // countrycodes/suffix (BG addresses must not be geocoded as AT) and the
        // event is tagged for its country. Sources default to 'AT'.
        country: src.country || 'AT',
      };
      // Town-pin jitter is useful on the map but not while enforcing an exact
      // crawl boundary: use the real geocoder/centroid point for the decision.
      let geo = await geocodeEvent(ev, { jitterTown: !scope });
      // Single-venue publishers (a theatre, a museum) name the ROOM, not the
      // house: Dschungel Wien's kids-theatre listings say "Bühne 1"/"Bühne 2",
      // which no geocoder can place — 175 events sat on the Vienna centroid.
      // The venue isn't in the event text, it's the publisher's identity, so
      // fall back to the source's own address whenever the event's own location
      // resolves no better than town level. A fact about the house, not a guess
      // about the event (scripts/migrate-source-venue.mjs).
      if ((!geo || geo.geo_precision === 'town') && src.default_venue) {
        const houseGeo = await geocodeEvent(
          { venue: src.default_venue, address: src.default_address, town: ev.town || src.town, country: ev.country },
          { jitterTown: false },
        );
        if (houseGeo && houseGeo.geo_precision !== 'town') geo = houseGeo;
      }
      if (!geo) continue;
      if (scope && !isWithinCrawlScope(geo, scope)) {
        outsideScope++;
        continue;
      }
      const upserted = { ...ev, lat: geo.lat, lng: geo.lng, geo_precision: geo.geo_precision };
      const upsertRes = await upsertEvent(upserted);
      ok++;
      // Fuzzy cross-source dedup is a FALLBACK for when the exact content_hash/
      // legacy match above already missed (upsertRes.updated === false means a
      // brand-new row was just inserted) — see tryFuzzyMerge.
      if (!upsertRes.updated && await tryFuzzyMerge({ ...upserted, id: upsertRes.id })) {
        fuzzyMerged++;
      }
    } catch (e) {
      // One malformed event (bad types, unexpected DB constraint, etc.) must
      // never take down the whole national batch — log and move to the next.
      console.log(`  ! skip event "${raw.title || '(untitled)'}" (${src.name}): ${e.code || e.message}`);
    }
  }
  console.log(`  ${ok}/${events.length} events upserted (route: ${route})`
    + (outsideScope ? `, ${outsideScope} outside ${scope.id} skipped` : '')
    + (fuzzyMerged ? `, ${fuzzyMerged} fuzzy-merged` : ''));
  // An LLM round with ZERO candidates is ambiguous: an empty calendar, or a
  // model that silently returned nothing (an overloaded Gemini answers 200
  // with an empty list). Stamping page_hash/etag here wedged the source: every
  // later crawl hash-skipped as "unchanged" until the page text changed — 333
  // of the 371 frozen sources were in exactly this state. Skip the stamp, so
  // the next due crawl re-extracts instead of trusting a possibly-bogus empty.
  // Structured routes ($0, deterministic) and any round with candidates stamp
  // as before. Costs one flash-lite call per genuinely-empty source per crawl.
  if (!(route === 'llm' && events.length === 0)) {
    await updateSourceMeta(src.id, {
      page_hash: hash, feed_kind: route,
      etag: res.headers.get('etag'), last_modified: res.headers.get('last-modified'),
    });
  }
  const tier = await recordStats(src, { type: 'extracted', eventsFound: ok });
  return { ok, fail: 0, tier, outsideScope, attempted: true, fuzzyMerged };
}

// --- sustainable speed: bounded worker pool across DIFFERENT hosts ---
// The bottleneck is the polite per-host delay (politeFetch), never extraction —
// so speed comes only from running multiple hosts in parallel, never from
// shrinking that delay. Grouping by host and giving each host lane a single
// sequential worker guarantees two requests never hit the same host at once
// (politeFetch's per-host timer isn't concurrency-safe across simultaneous
// callers, so this grouping is what actually enforces "one host, one at a time").
const HOST_CONCURRENCY = 6;
function groupByHost(sources) {
  const byHost = new Map();
  for (const src of sources) {
    let host;
    try { host = new URL(src.url).host; } catch { host = src.url; }
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(src);
  }
  return [...byHost.values()];
}
async function runHostPool(groups, worker) {
  let next = 0;
  async function lane() {
    while (next < groups.length) {
      const group = groups[next++];
      for (const src of group) await worker(src); // one host, strictly sequential
    }
  }
  await Promise.all(Array.from({ length: Math.min(HOST_CONCURRENCY, groups.length) || 1 }, lane));
}

async function main() {
  const urlArg = process.argv.indexOf('--url');
  let force = process.argv.includes('--force');
  const all = process.argv.includes('--all');
  const recoverZeros = process.argv.includes('--recover-zeros');
  const scopeArg = process.argv.indexOf('--scope');
  const requestedScope = scopeArg > -1 ? crawlScope(process.argv[scopeArg + 1]) : null;
  if (scopeArg > -1 && !requestedScope) {
    throw new Error(`Unknown crawl scope "${process.argv[scopeArg + 1]}". Known scopes: ${Object.keys(CRAWL_SCOPES).join(', ')}`);
  }

  let sources, skippedCadence = 0;
  if (urlArg > -1) {
    sources = await getSourceByUrl(process.argv[urlArg + 1]); // single --url test: ignores tier/cadence
  } else if (recoverZeros) {
    // Recovery pass over sources frozen at zero yield (works=true,
    // events_last=0, tier=dead included): most were wedged by a page_hash
    // stamped during a failed-extraction window, so hash/cadence must both be
    // bypassed — force implies both. Successful rounds reset zero_streak and
    // re-derive tier, so unjustly-dead sources revive on their own.
    sources = await getZeroYieldSources();
    force = true;
  } else {
    const candidates = await getSourcesForCrawl({ all }); // already excludes tier='dead' unless --all
    sources = all ? candidates : candidates.filter((s) => {
      const due = isDue(s);
      if (!due) skippedCadence++;
      return due;
    });
  }
  if (requestedScope) {
    sources = sources.filter((s) => (
      s.country === requestedScope.country && s.region === requestedScope.sourceRegion
    ));
  }

  const groups = groupByHost(sources);
  console.log(`Crawling ${sources.length} source(s) across ${groups.length} host(s) (up to ${HOST_CONCURRENCY} in parallel)`
    + (skippedCadence ? `, ${skippedCadence} skipped (tier cadence not due)` : '') + ' …');

  let total = 0, totalOutsideScope = 0, extractErrors = 0, totalFuzzyMerged = 0;
  // "Attempted" = an actual fetch/extraction round happened this run — NOT a
  // cadence skip, NOT a blocked_reason skip, NOT a hash/304-unchanged round
  // (those are healthy no-ops by design, not failures). Used only for the
  // systemic-failure guard below: the htmlToText lesson (tasks/lessons.md
  // 2026-07-14) is that N identical per-source zero-yield rounds must read as
  // ONE systemic failure, not N unrelated ones — and mixing in the sources
  // that were SUPPOSED to yield 0 (unchanged) would drown that signal.
  let attempted = 0, attemptedZero = 0;
  const tierCounts = { active: 0, slow: 0, dormant: 0, dead: 0 };
  await runHostPool(groups, async (src) => {
    // A crash anywhere in one source's processing (fetch, extraction, stats,
    // an upsert that slipped past the per-event guard) must not abort the
    // rest of the batch — log and move on to the next source.
    try {
      const {
        ok, tier, outsideScope = 0, extractError, attempted: wasAttempted, fuzzyMerged = 0,
      } = await crawlSource(src, { force, scope: requestedScope });
      total += ok;
      totalOutsideScope += outsideScope;
      totalFuzzyMerged += fuzzyMerged;
      if (tier) tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      if (wasAttempted) {
        attempted += 1;
        if (ok === 0) attemptedZero += 1;
      }
      if (extractError) {
        extractErrors += 1;
        // A provider-side extraction failure leaves last_crawled alone so the
        // source stays due and retries next run instead of waiting out its
        // tier cadence with events_last mislabeled 0.
      } else {
        await markSourceCrawled(src.id);
      }
    } catch (e) {
      console.log(`! skip source "${src.name}" (${src.url}): ${e.code || e.message}`);
    }
  });

  const expired = await expireFinished();
  console.log(`\nCrawl done: ${total} events upserted, ${expired} expired.`);
  if (extractErrors) console.log(`Provider errors: ${extractErrors} source(s) skipped without stats change — they stay due and retry next run.`);
  if (totalOutsideScope) console.log(`Scope guard: ${totalOutsideScope} out-of-radius event(s) skipped.`);
  console.log(`fuzzy-merged: ${totalFuzzyMerged}`);
  console.log(`Tiers — active: ${tierCounts.active}, slow: ${tierCounts.slow}, dormant: ${tierCounts.dormant}, `
    + `dead: ${tierCounts.dead}, skipped (not due): ${skippedCadence}`);
  // One bad night (a provider outage, a shared-layer refactor bug) makes every
  // attempted source fail identically — that must read as ONE alarm, not a
  // wall of per-source skip lines (tasks/lessons.md 2026-07-14).
  if (attempted > 0 && attemptedZero / attempted > 0.5) {
    console.log(`\n⚠ SYSTEMIC: ${attemptedZero}/${attempted} attempted source(s) yielded 0 events this run — `
      + 'check the extraction pipeline before assuming this many unrelated source failures.');
  }
}

// Guarded so scripts/rot-report.mjs can `import { TIER_CADENCE_DAYS }` from
// this file without triggering a full crawl as an import side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closeDb);
}
