// Mine the Landeshauptstadt Stuttgart children's-events RSS feed through its
// per-item iCal exports. Facts only: RSS descriptions and images are ignored.
//
// Usage:
//   node scripts/mine-stuttgart-city.mjs
//   node scripts/mine-stuttgart-city.mjs --output data/mined/custom.json

// The RSS filter is intentionally narrow (Kinder). This source covers the city
// of Stuttgart; the wider 40 km crawl scope is assembled from other sources.
import fs from 'node:fs/promises';
import path from 'node:path';

const FEED_URL = 'https://www.stuttgart.de/service/veranstaltungen?form=eventSearch-1.form&action=submit&sp%3Acategories%5B77309%5D%5B%5D=77311&sp%3Aout=rss&sp%3Acmp=eventSearch-1-0-searchResult';
const SOURCE_NAME = 'Landeshauptstadt Stuttgart';
const TIME_ZONE = 'Europe/Berlin';
const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';
const HOST_DELAY_MS = 1000;
const lastFetchByHost = new Map();

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] || null;
}

function berlinParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

async function politeFetch(url) {
  const parsed = new URL(url);
  const elapsed = Date.now() - (lastFetchByHost.get(parsed.host) || 0);
  const wait = HOST_DELAY_MS - elapsed;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastFetchByHost.set(parsed.host, Date.now());
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/calendar, application/rss+xml, application/xml;q=0.9, text/plain;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
  });
}

function robotsAllows(text, pathname) {
  let applies = false;
  let sawRule = false;
  const disallowed = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (sawRule) {
        applies = false;
        sawRule = false;
      }
      const agent = value.toLowerCase();
      applies = agent === '*' || UA.toLowerCase().includes(agent);
    } else if ((key === 'allow' || key === 'disallow') && applies) {
      sawRule = true;
      if (key === 'disallow' && value) disallowed.push(value);
    }
  }
  return !disallowed.some((prefix) => prefix === '/' || pathname.startsWith(prefix));
}

async function assertRobotsAllowed(url) {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  const response = await politeFetch(robotsUrl);
  if (!response.ok) throw new Error(`robots.txt returned HTTP ${response.status}: ${robotsUrl}`);
  const text = await response.text();
  if (!robotsAllows(text, parsed.pathname)) throw new Error(`robots.txt disallows ${parsed.pathname}`);
}

function decodeXml(value) {
  return (value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

function xmlTag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : null;
}

function rssItems(xml) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match) => ({
      title: xmlTag(match[0], 'title'),
      detailUrl: xmlTag(match[0], 'link'),
    }))
    .filter((item) => item.title && item.detailUrl);
}

function unfoldIcs(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeIcs(value) {
  return (value || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function icsProperty(block, name) {
  const match = block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'im'));
  return match ? unescapeIcs(match[1]) : null;
}

function utcToBerlin(y, month, day, hour, minute, second) {
  const instant = new Date(Date.UTC(+y, +month - 1, +day, +hour, +minute, +second));
  const parts = berlinParts(instant);
  return { date: parts.date, time: parts.time.slice(0, 5) };
}

function parseIcsDate(value) {
  const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return { date: null, time: null };
  const [, year, month, day, hour, minute, second = '00', utc] = match;
  if (!hour) return { date: `${year}-${month}-${day}`, time: null };
  if (utc) return utcToBerlin(year, month, day, hour, minute, second);
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function icsDateProperty(block, name) {
  return parseIcsDate(icsProperty(block, name));
}

const CATEGORY_RULES = [
  [/^kinder$/i, 'family'],
  [/festival|^fest(?:\s*\/\s*event)?$/i, 'festival'],
  [/flohmarkt|\bmarkt\b/i, 'market'],
  [/musik|konzert/i, 'music'],
  [/theater|aufführung|ausstellung|museum|literatur|lesung|film|oper|ballett|tanz/i, 'culture'],
  [/sport|bewegung|lauf|turnier/i, 'sport'],
  [/workshop|werkstatt|kurs|seminar|mitmach/i, 'workshop'],
  [/essen|trinken|kulinar/i, 'food'],
];

function mapCategories(raw) {
  const categories = [];
  const sourceCategories = String(raw || '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const sourceCategory of sourceCategories) {
    for (const [pattern, mapped] of CATEGORY_RULES) {
      if (pattern.test(sourceCategory) && !categories.includes(mapped)) categories.push(mapped);
    }
  }
  return categories;
}

function parseIcsEvent(text) {
  const unfolded = unfoldIcs(text);
  const block = unfolded.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i)?.[1];
  if (!block) return null;
  const title = icsProperty(block, 'SUMMARY');
  const sourceUrl = icsProperty(block, 'URL');
  const start = icsDateProperty(block, 'DTSTART');
  const end = icsDateProperty(block, 'DTEND');
  if (!title || !sourceUrl || !start.date) return null;
  return {
    title,
    description_short: null,
    date_start: start.date,
    time_start: start.time,
    date_end: end.date,
    time_end: end.time,
    venue: null,
    address_text: icsProperty(block, 'LOCATION'),
    town: 'Stuttgart',
    oblast: 'Baden-Württemberg',
    categories: mapCategories(icsProperty(block, 'CATEGORIES')),
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    lat: null,
    lng: null,
    source_url: sourceUrl,
    source_name: SOURCE_NAME,
    country: 'DE',
  };
}

function comparable(date, time) {
  return `${date}T${time || '00:00'}:00`;
}

function alreadyEnded(event, now) {
  const nowValue = `${now.date}T${now.time}`;
  if (event.date_end) return comparable(event.date_end, event.time_end) < nowValue;
  // Without DTEND, only a prior calendar date proves that the event is over.
  return event.date_start < now.date;
}

function iCalUrl(detailUrl) {
  const url = new URL(detailUrl);
  url.searchParams.set('sp:out', 'iCal');
  return url.toString();
}

async function fetchText(url) {
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const generated = berlinParts().date;
  const output = argValue('--output') || `data/mined/events-stuttgart-city-${generated}.json`;
  await assertRobotsAllowed(FEED_URL);

  const feed = await fetchText(FEED_URL);
  const items = rssItems(feed);
  if (!items.length) throw new Error('The Stuttgart RSS feed contained no usable items.');

  const now = berlinParts();
  const events = [];
  const failedUrls = [];
  let skippedEnded = 0;
  for (const [index, item] of items.entries()) {
    const url = iCalUrl(item.detailUrl);
    try {
      const event = parseIcsEvent(await fetchText(url));
      if (!event) {
        failedUrls.push(url);
      } else if (!alreadyEnded(event, now)) {
        events.push(event);
      } else {
        skippedEnded += 1;
      }
    } catch {
      failedUrls.push(url);
    }
    if ((index + 1) % 10 === 0 || index + 1 === items.length) {
      console.log(`Fetched ${index + 1}/${items.length} iCal entries`);
    }
  }

  const deduped = [...new Map(events.map((event) => [
    `${event.source_url}|${event.date_start}|${event.time_start || ''}`,
    event,
  ])).values()].sort((a, b) => (
    comparable(a.date_start, a.time_start).localeCompare(comparable(b.date_start, b.time_start))
    || a.title.localeCompare(b.title, 'de')
  ));

  const data = {
    _meta: {
      scope: 'stuttgart-40km',
      generated,
      generator: 'scripts/mine-stuttgart-city.mjs',
      timezone: TIME_ZONE,
      feed_url: FEED_URL,
      feed_items: items.length,
      skipped_ended: skippedEnded,
      count: deduped.length,
      notes: [
        'Nur der offizielle Kinder-RSS-Feed der Landeshauptstadt Stuttgart wurde verwendet.',
        'Termine, Adressen, Kategorien und Detail-URLs stammen aus den verlinkten iCal-Dateien; RSS-Beschreibungen und Bilder wurden nicht übernommen.',
        'Dieser Datensatz deckt nur das Stadtgebiet Stuttgart innerhalb des Crawl-Bereichs Stuttgart 40 km ab.',
      ],
    },
    source_registry: [{
      name: SOURCE_NAME,
      url: FEED_URL,
      kind: 'crawl',
      town: 'Stuttgart',
      country: 'DE',
      region: 'Stuttgart 40km',
      cms: 'sitepark-ical',
      works: failedUrls.length < items.length,
      notes: 'Offizieller, nach Kinder-Veranstaltungen gefilterter RSS-Feed mit iCal-Datei pro Termin.',
    }],
    failed_urls: failedUrls,
    events: deduped,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${deduped.length} events to ${output} (${failedUrls.length} failed URL(s)).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
