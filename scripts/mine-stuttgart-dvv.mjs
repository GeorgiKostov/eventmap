// Mine the vetted Stuttgart-area DVV/Komm.ONE municipal RSS feeds into a
// reviewable JSON file. Facts and canonical detail links only; descriptions
// and images are never copied. No database writes.
//
// Usage: node scripts/mine-stuttgart-dvv.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDvvEvents } from '../lib/dvv-events.js';

const CATALOG = 'data/catalog/probed-stuttgart-40km.json';
const TIME_ZONE = 'Europe/Berlin';
const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';

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
  let delayMs = 1000;
  const disallowed = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') wildcard = value === '*';
    else if (wildcard && key === 'disallow' && value) disallowed.push(value);
    else if (wildcard && key === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) delayMs = Math.min(seconds * 1000, 60000);
    }
  }
  return {
    allowed: !disallowed.some((prefix) => prefix === '/' || pathname.startsWith(prefix)),
    delayMs,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml;q=0.9' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

function ended(event, now) {
  if (!event.date_end) return event.date_start < now.date;
  return `${event.date_end}T${event.time_end || '23:59'}` < `${now.date}T${now.time}`;
}

function minedEvent(event, source) {
  return {
    title: event.title,
    description_short: null,
    date_start: event.date_start,
    time_start: event.time_start,
    date_end: event.date_end,
    time_end: event.time_end,
    venue: event.venue,
    address_text: event.address,
    town: event.town || source.town,
    oblast: 'Baden-Württemberg',
    categories: event.categories,
    is_free: event.is_free,
    age_min: null,
    age_max: null,
    indoor: null,
    lat: null,
    lng: null,
    source_url: event.source_url,
    source_name: source.name,
    country: 'DE',
  };
}

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
}

// Some DVV feeds publish a corrected copy with a new node ID. Collapse only
// same-title/day/town/location duplicates: exact times collapse, and an
// undated-time copy yields to the otherwise-identical timed record. Distinct
// times or locations remain independent occurrences.
function dedupeMunicipalCopies(events) {
  const groups = new Map();
  for (const event of events) {
    const key = [event.title, event.date_start, event.town, event.venue, event.address_text]
      .map(normalized).join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const kept = [];
  for (const group of groups.values()) {
    const timed = group.filter((event) => event.time_start);
    const candidates = timed.length ? timed : group;
    const byTime = new Map();
    for (const event of candidates) {
      const key = `${event.time_start || ''}|${event.time_end || ''}`;
      if (!byTime.has(key)) byTime.set(key, event);
    }
    kept.push(...byTime.values());
  }
  return kept;
}

async function mineSource(source, now) {
  const url = new URL(source.url);
  const robots = await fetchText(`${url.origin}/robots.txt`);
  const policy = robotsPolicy(robots, url.pathname);
  if (!policy.allowed) throw new Error(`robots.txt disallows ${url.pathname}`);
  await new Promise((resolve) => setTimeout(resolve, policy.delayMs));
  const parsed = parseDvvEvents(await fetchText(source.url), source);
  const events = parsed.filter((event) => !ended(event, now)).map((event) => minedEvent(event, source));
  return { source, feedItems: parsed.length, events };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));
  const sources = catalog.proposed.filter((source) => source.cms === 'dvv');
  const now = berlinNow();
  const settled = await Promise.allSettled(sources.map((source) => mineSource(source, now)));
  const successes = settled.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failures = settled.flatMap((result, index) => (result.status === 'rejected' ? [{
    source: sources[index]?.name || null,
    error: result.reason?.message || String(result.reason),
  }] : []));
  const rawEvents = successes.flatMap((result) => result.events);
  const events = dedupeMunicipalCopies(rawEvents).sort((a, b) => (
    `${a.date_start}T${a.time_start || '00:00'}`.localeCompare(`${b.date_start}T${b.time_start || '00:00'}`)
      || a.title.localeCompare(b.title, 'de')
  ));
  const generated = now.date;
  const output = `data/mined/events-stuttgart-dvv-${generated}.json`;
  const data = {
    _meta: {
      scope: 'stuttgart-40km', generated, generator: 'scripts/mine-stuttgart-dvv.mjs',
      timezone: TIME_ZONE, sources_attempted: sources.length, sources_succeeded: successes.length,
      feed_items: successes.reduce((sum, result) => sum + result.feedItems, 0),
      duplicates_skipped: rawEvents.length - events.length, count: events.length,
      notes: 'Official municipal DVV RSS facts only; descriptions and images omitted; robots Crawl-delay honored per host.',
    },
    source_registry: successes.map(({ source }) => ({
      name: source.name, url: source.url, kind: source.kind, town: source.town,
      country: 'DE', region: 'Stuttgart 40km', cms: 'dvv', works: true, notes: source.notes,
    })),
    failures,
    events,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${events.length} current/future events from ${successes.length}/${sources.length} feeds to ${output}.`);
  if (failures.length) console.log(JSON.stringify(failures, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
