// First-party Niedermair monthly programmes: JSON-LD dates corroborated by visible rows.
import { decodeEntities, stripTags } from './entities.js';
import { validDateOf, validTimeOf } from './event-time.js';
import { parseJsonLdEvents } from './jsonld-events.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const NIEDERMAIR_SOURCE_URL = 'https://niedermair.at/spielplan';
export const NIEDERMAIR_CHILDREN_URL = 'https://niedermair.at/kindertheater';

const MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
const normalized = (value) => stripTags(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function field(html, name, tag = 'span') {
  return stripTags(html.match(new RegExp(
    `<${tag}\\b[^>]*class=["'][^"']*\\b${name}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i',
  ))?.[1] || '');
}

export function parseNiedermairEvents(html, src = {}) {
  const sourceUrl = src.url || NIEDERMAIR_SOURCE_URL;
  const month = new URL(sourceUrl).pathname.match(/\/(\d{2})\/(\d{4})\/?$/);
  if (!month) return [];
  const starts = [...html.matchAll(/<a\b[^>]*class=["'][^"']*\beventrow\b[^"']*["'][^>]*>/gi)];
  const rows = starts.map((match, index) => html.slice(match.index, starts[index + 1]?.index || html.length));
  const events = [];
  const seen = new Set();
  for (const event of parseJsonLdEvents(html, src)) {
    if (!validDateOf(event.date_start) || !validTimeOf(`${event.date_start}T${event.time_start}`)) continue;
    if (event.date_start.slice(0, 7) !== `${month[2]}-${month[1]}`) continue;
    const row = rows.find((candidate) => (
      normalized(field(candidate, 'artistname', 'strong')) === normalized(event.title)
      && field(candidate, 'day').padStart(2, '0') === event.date_start.slice(8)
      && field(candidate, 'month').toUpperCase() === MONTHS[Number(month[1]) - 1]
      && field(candidate, 'date').match(/\b((?:[01]\d|2[0-3]):[0-5]\d)\b/)?.[1] === event.time_start
    ));
    if (!row) continue;
    const title = field(row, 'artistname', 'strong');
    if (/abgesagt|entfällt|entfaellt|verschoben|sommerpause/i.test(`${title} ${field(row, 'additionalText')}`)) continue;
    const key = `${event.date_start}|${event.time_start}|${normalized(title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      ...event,
      title,
      date_end: null,
      time_end: null,
      venue: 'Kabarett Niedermair',
      address: 'Lenaugasse 1A, 1080 Wien',
      town: 'Wien',
      categories: /\/kindertheater\//.test(sourceUrl) ? ['culture', 'family'] : ['culture'],
      is_free: null,
      age_min: null,
      age_max: null,
      indoor: true,
      description: null,
      // Booking offers can point at the bare homepage for sold-out shows.
      // The fetched monthly programme is the corroborated source for every row.
      source_url: sourceUrl,
    });
  }
  return events;
}

export async function fetchNiedermairEvents(src = { url: NIEDERMAIR_SOURCE_URL }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  shellHtml = null,
  now = new Date(),
} = {}) {
  const sourceUrl = src.url || NIEDERMAIR_SOURCE_URL;
  if (!(await robotsFn(sourceUrl))) return [];
  async function read(url) {
    const response = await fetchImpl(url);
    if (!response?.ok) throw new Error(`Niedermair programme HTTP ${response?.status || 'failure'}: ${url}`);
    return response.text();
  }
  const html = shellHtml ?? await read(sourceUrl);
  const base = new URL(sourceUrl);
  const section = base.pathname.split('/')[1];
  const links = new Map();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = new URL(decodeEntities(match[1]), sourceUrl);
    const month = url.pathname.match(new RegExp(`^/${section}/(\\d{2})/(\\d{4})/?$`));
    if (url.origin === base.origin && month) links.set(`${month[2]}-${month[1]}`, url.toString());
  }
  if (!links.size) throw new Error('Niedermair monthly programme navigation missing');
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const events = [];
  for (let offset = 0; offset < 3; offset++) {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const url = links.get(key);
    if (!url || !(await robotsFn(url))) continue;
    const listing = url === sourceUrl ? html : await read(url);
    events.push(...parseNiedermairEvents(listing, { ...src, url }));
  }
  return events;
}
