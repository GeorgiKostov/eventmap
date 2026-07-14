// Mine the public Kreativregion Stuttgart archive through its WordPress REST
// records and per-event iCal exports. Detail pages are read only for the
// factual location label. No descriptions, images, model calls or DB writes.
//
// BOOTSTRAP ONLY (hard rule 7). The recurring refresh path is the cron, via the
// `wordpress-ical` adapter in scripts/crawl.mjs — this script exists to produce a
// reviewable seed file, not to keep the source fresh.
//
// Usage: node scripts/mine-stuttgart-kreativregion.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  archiveEventLinks, archivePageCount, decodeWpTitle, eventIdFromDetail,
  parseKreativregionIcs, venueFromDetail,
} from '../lib/kreativregion-events.js';

const ORIGIN = 'https://kreativ.region-stuttgart.de';
const ARCHIVE_URL = `${ORIGIN}/termine/`;
const REST_URL = `${ORIGIN}/wp-json/wp/v2/dmwpevents`;
const SOURCE_NAME = 'Kreativregion Stuttgart';
const TIME_ZONE = 'Europe/Berlin';
const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';
const MIN_DELAY_MS = 1000;
let lastFetchAt = 0;

function berlinNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function robotsPolicy(text, pathname) {
  let wildcard = false;
  let delayMs = MIN_DELAY_MS;
  const disallow = [];
  const allow = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') wildcard = value === '*';
    else if (wildcard && key === 'disallow' && value) disallow.push(value);
    else if (wildcard && key === 'allow' && value) allow.push(value);
    else if (wildcard && key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) delayMs = Math.max(MIN_DELAY_MS, Math.min(seconds * 1000, 60000));
    }
  }
  const bestAllow = Math.max(-1, ...allow.filter((prefix) => pathname.startsWith(prefix)).map((prefix) => prefix.length));
  const bestDeny = Math.max(-1, ...disallow.filter((prefix) => pathname.startsWith(prefix)).map((prefix) => prefix.length));
  return { allowed: bestDeny < 0 || bestAllow >= bestDeny, delayMs };
}

async function politeFetch(url, { accept = 'text/html,application/xhtml+xml' } = {}) {
  const wait = MIN_DELAY_MS - (Date.now() - lastFetchAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastFetchAt = Date.now();
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: accept },
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}: ${url}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  throw lastError || new Error(`Fetch failed: ${url}`);
}

async function fetchText(url, options) {
  return (await politeFetch(url, options)).text();
}

function slugFromUrl(url) {
  return new URL(url).pathname.split('/').filter(Boolean).at(-1);
}

function ended(event, now) {
  const eventEnd = `${event.date_end || event.date_start}T${event.time_end || '23:59'}`;
  return eventEnd < `${now.date}T${now.time}`;
}

async function archiveLinks() {
  const first = await fetchText(ARCHIVE_URL);
  const pages = Math.min(archivePageCount(first), 20);
  const links = archiveEventLinks(first);
  for (let page = 2; page <= pages; page += 1) {
    links.push(...archiveEventLinks(await fetchText(`${ARCHIVE_URL}page/${page}/`)));
  }
  return { pages, links: [...new Set(links)] };
}

async function restRecords(links) {
  const byLink = new Map();
  const slugs = links.map(slugFromUrl);
  for (let index = 0; index < slugs.length; index += 20) {
    const url = new URL(REST_URL);
    url.searchParams.set('slug', slugs.slice(index, index + 20).join(','));
    url.searchParams.set('per_page', '20');
    url.searchParams.set('_fields', 'id,slug,link,title');
    const response = await politeFetch(url, { accept: 'application/json' });
    for (const record of await response.json()) byLink.set(record.link, record);
  }
  return byLink;
}

async function mineRecord(link, record, now) {
  if (!record || !Number.isInteger(record.id) || record.link !== link) {
    throw new Error(`No matching WordPress REST record: ${link}`);
  }
  const detail = await fetchText(link);
  const detailId = eventIdFromDetail(detail);
  if (detailId !== record.id) throw new Error(`REST/detail id mismatch for ${link}`);
  const venue = venueFromDetail(detail);
  const icsUrl = `${ORIGIN}/feed/calendar/?id=${record.id}`;
  const ics = await fetchText(icsUrl, { accept: 'text/calendar' });
  const event = parseKreativregionIcs(ics, {
    title: decodeWpTitle(record.title?.rendered), source_url: link, venue,
  });
  if (!event || event.source_url !== link) throw new Error(`Invalid iCal facts for ${link}`);
  if (venue && !event.venue) event.venue = venue;
  if (!event.town && event.venue) {
    // townFromFacts is already applied by the parser; leave unknown locations
    // unknown instead of deriving a municipality from the regional source.
    event.town = null;
  }
  return ended(event, now) ? null : event;
}

async function main() {
  const robots = await fetchText(`${ORIGIN}/robots.txt`, { accept: 'text/plain' });
  for (const pathname of ['/termine/', '/wp-json/wp/v2/dmwpevents', '/feed/calendar/']) {
    const policy = robotsPolicy(robots, pathname);
    if (!policy.allowed) throw new Error(`robots.txt disallows ${pathname}`);
    if (policy.delayMs > MIN_DELAY_MS) throw new Error(`robots.txt requires an unsupported delay for ${pathname}`);
  }

  const now = berlinNow();
  const archive = await archiveLinks();
  const records = await restRecords(archive.links);
  const events = [];
  const failures = [];
  let skippedWithoutTown = 0;
  for (const [index, link] of archive.links.entries()) {
    try {
      const event = await mineRecord(link, records.get(link), now);
      // Kreativregion covers a larger area than the 40 km pilot and includes
      // online/Brussels/Heilbronn records. Only keep entries whose source facts
      // identify an in-scope municipality; seed still performs the exact
      // post-geocode radius check on every retained event.
      if (event?.town) events.push(event);
      else if (event) skippedWithoutTown += 1;
    } catch (error) {
      failures.push({ url: link, error: error?.message || String(error) });
    }
    if ((index + 1) % 10 === 0 || index + 1 === archive.links.length) {
      console.log(`Processed ${index + 1}/${archive.links.length} Kreativregion records`);
    }
  }

  const deduped = [...new Map(events.map((event) => [
    `${event.source_url}|${event.date_start}|${event.time_start || ''}`, event,
  ])).values()].sort((a, b) => (
    `${a.date_start}T${a.time_start || '00:00'}`.localeCompare(`${b.date_start}T${b.time_start || '00:00'}`)
      || a.title.localeCompare(b.title, 'de')
  ));
  const generated = now.date;
  const output = `data/mined/events-stuttgart-kreativregion-${generated}.json`;
  const data = {
    _meta: {
      scope: 'stuttgart-40km', generated, generator: 'scripts/mine-stuttgart-kreativregion.mjs',
      timezone: TIME_ZONE, archive_pages: archive.pages, archive_items: archive.links.length,
      rest_records: records.size, skipped_without_in_scope_town: skippedWithoutTown,
      count: deduped.length,
      notes: 'Public WRS archive + WordPress REST identity + per-event iCal facts. Detail pages provide location labels only. Prose/images omitted; records without a source-identifiable in-scope town are skipped, coordinates remain null, and the exact 40 km gate runs after geocoding at seed.',
    },
    source_registry: [{
      name: SOURCE_NAME, url: REST_URL, kind: 'regional', town: 'Stuttgart', country: 'DE',
      region: 'Stuttgart 40km', cms: 'wordpress-ical', works: true,
      notes: 'Repeatable: scripts/crawl.mjs has a wordpress-ical adapter, so the cron refreshes this. This script is a bootstrap only. Public WRS WordPress REST records with canonical links and per-event iCal exports.',
    }],
    failures,
    events: deduped,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${deduped.length} events (${failures.length} failures) to ${output}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
