// Recrawl registered sources every few days: fetch page → structured-data-first
// extraction (JSON-LD / iCal / RSS) with Claude/Gemini as the fallback → geocode
// → upsert (dedup by title+day+town) → expire finished events.
// Usage: npm run crawl                    (all sources marked works=1)
//        npm run crawl -- --url https://... (single source)
//        npm run crawl -- --force          (ignore page-hash change-detection)
// Requires Claude API credentials (ANTHROPIC_API_KEY or `ant auth login`).
import { createHash } from 'node:crypto';
import {
  upsertEvent, expireFinished, getSourceByUrl, getWorkingSources,
  markSourceCrawled, updateSourceMeta, setSourceNote, closeDb,
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

// Waterfall: JSON-LD → iCal → RSS/Atom. First route that yields ≥1 valid
// event wins and the LLM call is skipped entirely.
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

async function crawlSource(src, { force } = {}) {
  console.log(`\n→ ${src.name} (${src.url})`);

  try {
    if (!(await robotsAllowed(src.url))) {
      console.log('  robots.txt disallows this path, skipping');
      await setSourceNote(src.id, 'skipped: disallowed by robots.txt');
      return { ok: 0, fail: 0 };
    }
  } catch { /* robots check itself failed → default allow, proceed */ }

  let html;
  try {
    const res = await politeFetch(src.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.log(`  fetch failed: ${e.message}`);
    return { ok: 0, fail: 0, fetchError: true };
  }
  const text = htmlToText(html);
  if (text.length < 200) { console.log('  page too thin, skipping'); return { ok: 0, fail: 0 }; }

  const hash = createHash('sha256').update(text).digest('hex');
  if (!force && src.page_hash && src.page_hash === hash) {
    console.log('  unchanged, skipped');
    return { ok: 0, fail: 0 };
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
      return { ok: 0, fail: 1 };
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
  return { ok, fail: 0 };
}

async function main() {
  const urlArg = process.argv.indexOf('--url');
  const force = process.argv.includes('--force');
  const sources = urlArg > -1 ? await getSourceByUrl(process.argv[urlArg + 1]) : await getWorkingSources();
  console.log(`Crawling ${sources.length} source(s) …`);
  let total = 0;
  for (const src of sources) {
    const { ok } = await crawlSource(src, { force });
    total += ok;
    await markSourceCrawled(src.id);
  }
  const expired = await expireFinished();
  console.log(`\nCrawl done: ${total} events upserted, ${expired} expired.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closeDb);
