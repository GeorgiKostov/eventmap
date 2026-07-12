// Recrawl registered sources every few days: fetch page → structured-data-first
// extraction (JSON-LD / iCal / RSS / GEM2GO) with Claude/Gemini as the fallback →
// geocode → upsert (dedup by title+day+town) → expire finished events.
// Sources are grouped by host and crawled with a bounded worker pool so different
// hosts run in parallel — the per-host ≥1s politeness delay (politeFetch) is what
// makes a single host slow, never concurrency across hosts.
// Usage: npm run crawl                    (due sources: works=1, tier != dead, cadence elapsed)
//        npm run crawl -- --url https://... (single source, ignores tier/cadence)
//        npm run crawl -- --force          (ignore page-hash change-detection)
//        npm run crawl -- --all            (ignore tier/cadence gating — periodic deep sweep)
// Requires Claude API credentials (ANTHROPIC_API_KEY or `ant auth login`).
import { createHash } from 'node:crypto';
import {
  upsertEvent, expireFinished, getSourceByUrl, getSourcesForCrawl,
  markSourceCrawled, updateSourceMeta, updateSourceStats, setSourceNote, closeDb,
} from '../lib/db.js';
import { geocodeEvent } from '../lib/geocode.js';
import { extractFromPage } from '../lib/extract.js';

const CAT_EMOJI = {
  family: '🎈', festival: '🎪', market: '🧺', music: '🎶',
  culture: '🎭', food: '🥨', sport: '⚽', workshop: '🎨',
};

// Identifying UA for the whole crawl path (legal hygiene — polite citizen).
// lib/geocode.js keeps its own Nominatim UA per that service's usage policy.
const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';
const BOT_TOKEN = 'umkreisbot';

// Cheap HTML → text: strip tags/scripts, collapse whitespace. Claude handles the mess.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ouml;/g, 'ö').replace(/&auml;/g, 'ä').replace(/&uuml;/g, 'ü')
    .replace(/&Ouml;/g, 'Ö').replace(/&Auml;/g, 'Ä').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// --- per-host politeness + robots.txt (legal hygiene) ---
const HOST_DELAY_MS = 1000;
const lastFetchByHost = new Map();
const robotsCache = new Map(); // origin -> parsed rule groups

async function politeFetch(url, opts = {}) {
  const u = new URL(url);
  const wait = HOST_DELAY_MS - (Date.now() - (lastFetchByHost.get(u.host) || 0));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchByHost.set(u.host, Date.now());
  return fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(20000),
  });
}

// Groups consecutive "User-agent:" lines (no Disallow seen yet) into one rule
// set, per RFC 9309's common-case grouping. Good enough for our two agents
// (our UA and "*") — not a full robots.txt implementation.
function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (current && current.disallow.length === 0 && !current.sawRule) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], disallow: [], sawRule: false };
        groups.push(current);
      }
    } else if (key === 'disallow' && current) {
      current.sawRule = true;
      if (value) current.disallow.push(value);
    }
  }
  return groups;
}

function isDisallowed(groups, pathname) {
  const group = groups.find((g) => g.agents.some((a) => a.includes(BOT_TOKEN))) || groups.find((g) => g.agents.includes('*'));
  if (!group) return false;
  return group.disallow.some((p) => p === '/' || (p && pathname.startsWith(p)));
}

async function robotsAllowed(url) {
  const u = new URL(url);
  let groups = robotsCache.get(u.origin);
  if (!groups) {
    groups = [];
    try {
      const res = await politeFetch(`${u.origin}/robots.txt`);
      if (res.ok) groups = parseRobots(await res.text());
    } catch { /* no robots.txt / fetch failed → default allow */ }
    robotsCache.set(u.origin, groups);
  }
  return !isDisallowed(groups, u.pathname);
}

// --- structured-data-first extraction: JSON-LD → iCal → RSS/Atom → (LLM fallback in crawlSource) ---

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

function decodeEntities(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&ouml;/g, 'ö').replace(/&auml;/g, 'ä').replace(/&uuml;/g, 'ü')
    .replace(/&Ouml;/g, 'Ö').replace(/&Auml;/g, 'Ä').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
function stripTags(s) {
  return decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
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

// Waterfall: JSON-LD → iCal → GEM2GO (cms-gated) → RSS/Atom. First route
// that yields ≥1 valid event wins and the LLM call is skipped entirely.
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

  if (src.cms === 'gem2go') {
    const gem2goEvents = parseGem2goEvents(html, src);
    if (gem2goEvents.length) return { route: 'gem2go', events: gem2goEvents };
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
const TIER_CADENCE_DAYS = { active: 2, slow: 5, dormant: 7 };
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

async function crawlSource(src, { force } = {}) {
  console.log(`\n→ ${src.name} (${src.url})`);

  try {
    if (!(await robotsAllowed(src.url))) {
      console.log('  robots.txt disallows this path, skipping');
      await setSourceNote(src.id, 'skipped: disallowed by robots.txt');
      const tier = await recordStats(src, { type: 'noContent' });
      return { ok: 0, fail: 0, tier };
    }
  } catch { /* robots check itself failed → default allow, proceed */ }

  let html;
  try {
    const res = await politeFetch(src.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.log(`  fetch failed: ${e.message}`);
    const tier = await recordStats(src, { type: 'noContent' });
    return { ok: 0, fail: 0, fetchError: true, tier };
  }
  const text = htmlToText(html);
  if (text.length < 200) {
    console.log('  page too thin, skipping');
    const tier = await recordStats(src, { type: 'noContent' });
    return { ok: 0, fail: 0, tier };
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
      console.log(`  extraction failed: ${e.message}`);
      const tier = await recordStats(src, { type: 'noContent' });
      return { ok: 0, fail: 1, tier };
    }
  }

  let ok = 0;
  for (const raw of events) {
    if (!raw.title || !raw.date_start) continue;
    const time = /^\d{2}:\d{2}$/.test(raw.time_start || '') ? raw.time_start : null;
    const starts_at = `${raw.date_start}T${time || '09:00'}`;
    let ends_at = raw.time_end && /^\d{2}:\d{2}$/.test(raw.time_end)
      ? `${raw.date_end || raw.date_start}T${raw.time_end}` : null;
    if (ends_at && ends_at <= starts_at) ends_at = null; // overnight/garbled end times
    const ev = {
      title: raw.title,
      description: raw.description || null,
      starts_at,
      ends_at,
      all_day: time ? 0 : 1,
      venue: raw.venue, address: raw.address, town: raw.town || src.town,
      categories: (raw.categories || []).filter((c) => CAT_EMOJI[c]),
      is_free: raw.is_free, age_min: raw.age_min, age_max: raw.age_max, indoor: raw.indoor,
      emoji: CAT_EMOJI[(raw.categories || [])[0]] || '📌',
      src_kind: 'crawl',
      source_name: src.name,
      source_url: raw.source_url || src.url,
    };
    const geo = await geocodeEvent(ev);
    if (!geo) continue;
    await upsertEvent({ ...ev, lat: geo.lat, lng: geo.lng, geo_precision: geo.geo_precision });
    ok++;
  }
  console.log(`  ${ok}/${events.length} events upserted (route: ${route})`);
  await updateSourceMeta(src.id, { page_hash: hash, feed_kind: route });
  const tier = await recordStats(src, { type: 'extracted', eventsFound: ok });
  return { ok, fail: 0, tier };
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
  const force = process.argv.includes('--force');
  const all = process.argv.includes('--all');

  let sources, skippedCadence = 0;
  if (urlArg > -1) {
    sources = await getSourceByUrl(process.argv[urlArg + 1]); // single --url test: ignores tier/cadence
  } else {
    const candidates = await getSourcesForCrawl({ all }); // already excludes tier='dead' unless --all
    sources = all ? candidates : candidates.filter((s) => {
      const due = isDue(s);
      if (!due) skippedCadence++;
      return due;
    });
  }

  const groups = groupByHost(sources);
  console.log(`Crawling ${sources.length} source(s) across ${groups.length} host(s) (up to ${HOST_CONCURRENCY} in parallel)`
    + (skippedCadence ? `, ${skippedCadence} skipped (tier cadence not due)` : '') + ' …');

  let total = 0;
  const tierCounts = { active: 0, slow: 0, dormant: 0, dead: 0 };
  await runHostPool(groups, async (src) => {
    const { ok, tier } = await crawlSource(src, { force });
    total += ok;
    if (tier) tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    await markSourceCrawled(src.id);
  });

  const expired = await expireFinished();
  console.log(`\nCrawl done: ${total} events upserted, ${expired} expired.`);
  console.log(`Tiers — active: ${tierCounts.active}, slow: ${tierCounts.slow}, dormant: ${tierCounts.dormant}, `
    + `dead: ${tierCounts.dead}, skipped (not due): ${skippedCadence}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closeDb);
