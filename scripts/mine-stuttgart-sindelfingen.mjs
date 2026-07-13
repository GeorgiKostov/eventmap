// Mine the official Stadt Sindelfingen event list. Facts shown in the public
// result cards only; no descriptions/images, model calls or DB writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSindelfingenEvents, sindelfingenPageCount } from '../lib/sindelfingen-events.js';

const ORIGIN = 'https://www.sindelfingen.de';
const BASE_PATH = '/kultur-freizeit/veranstaltungen/veranstaltungskalender';
const SOURCE_URL = `${ORIGIN}${BASE_PATH}/seite-1/suche-none`;
const TIME_ZONE = 'Europe/Berlin';
const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';
let lastFetch = 0;

function berlinDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function fetchText(url) {
  const wait = 1000 - (Date.now() - lastFetch);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastFetch = Date.now();
  const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

function robotsAllowed(text, pathname) {
  let wildcard = false;
  const disallow = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') wildcard = value === '*';
    else if (wildcard && key === 'disallow' && value) disallow.push(value);
  }
  return !disallow.some((prefix) => prefix === '/' || pathname.startsWith(prefix));
}

async function main() {
  const robots = await fetchText(`${ORIGIN}/robots.txt`);
  if (!robotsAllowed(robots, BASE_PATH)) throw new Error(`robots.txt disallows ${BASE_PATH}`);
  const first = await fetchText(SOURCE_URL);
  const pageCount = Math.min(sindelfingenPageCount(first), 100);
  const events = parseSindelfingenEvents(first);
  for (let page = 2; page <= pageCount; page += 1) {
    events.push(...parseSindelfingenEvents(await fetchText(`${ORIGIN}${BASE_PATH}/seite-${page}/suche-none`)));
  }
  const today = berlinDate();
  const current = events.filter((event) => (
    (event.date_end || event.date_start) >= today
    && !/\babgesagt\b|\bentfällt\b|\bcancelled\b/i.test(event.title)
  ));
  const deduped = [...new Map(current.map((event) => [
    `${event.source_url}|${event.date_start}`, event,
  ])).values()].sort((a, b) => a.date_start.localeCompare(b.date_start) || a.title.localeCompare(b.title, 'de'));
  const output = `data/mined/events-stuttgart-sindelfingen-${today}.json`;
  const data = {
    _meta: {
      scope: 'stuttgart-40km', generated: today, generator: 'scripts/mine-stuttgart-sindelfingen.mjs',
      timezone: TIME_ZONE, pages: pageCount, parsed: events.length, count: deduped.length,
      notes: 'Official visible result-card facts only. Exact detail links retained; descriptions/images omitted; all-day labels become null times and explicitly cancelled records are skipped.',
    },
    source_registry: [{
      name: 'Stadt Sindelfingen', url: SOURCE_URL, kind: 'municipal', town: 'Sindelfingen',
      country: 'DE', region: 'Stuttgart 40km', cms: 'typo3-hwveranstaltung', works: false,
      notes: 'Refresh only with `node scripts/mine-stuttgart-sindelfingen.mjs`; generic crawl has no deterministic hwveranstaltung adapter.',
    }],
    failures: [], events: deduped,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${deduped.length} Sindelfingen events from ${pageCount} pages to ${output}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
