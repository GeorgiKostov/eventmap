// Deterministic adapter for the official last by Schachermayer calendar.
// The monthly listing exposes stable detail links; each detail page carries
// the visible date, time and room in server-rendered HTML.

import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const LAST_SPACE_SOURCE_URL = 'https://last-space.at/page/event';
const DEFAULT_MAX_MONTHS = 3;

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim() || null;
}

function absoluteUrl(href, base) {
  try { return href ? new URL(decodeEntities(href), base).toString() : null; } catch { return null; }
}

function categoriesFor(value) {
  const source = String(value || '').toLowerCase();
  const categories = [];
  if (/musik|konzert|jam|dj|dance|tanz/.test(source)) categories.push('music');
  if (/festival/.test(source)) categories.push('festival');
  if (/kind|famil|jugend/.test(source)) categories.push('family');
  if (/workshop|kurs|seminar|repair/.test(source)) categories.push('workshop');
  if (/flohmarkt|markt|börse/.test(source)) categories.push('market');
  if (/action\s*sport|e-?sport/.test(source)) categories.push('sport');
  if (/kultur|culture|theater|film|lesung|ausstellung/.test(source)) categories.push('culture');
  return [...new Set(categories)];
}

export function lastSpaceDetailLinks(html, baseUrl = LAST_SPACE_SOURCE_URL) {
  const links = new Set();
  const re = /href=["']([^"']*\?page=event(?:&|&amp;)action=view(?:&|&amp;)id=\d+)["']/gi;
  for (const match of String(html || '').matchAll(re)) {
    const url = absoluteUrl(match[1], baseUrl);
    if (url) links.add(url);
  }
  return [...links];
}

export function parseLastSpaceDetail(html, detailUrl, src = {}) {
  const title = text(String(html || '').match(
    /<h1\b[^>]*class=["'][^"']*\bsmall-heading\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
  )?.[1]);
  const dateText = text(String(html || '').match(
    /class=["'][^"']*\bevent-date\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )?.[1]);
  const date = dateText?.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (!title || !date) return null;

  const timeText = text(String(html || '').match(
    /class=["'][^"']*\bevent-time\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )?.[1]);
  const times = timeText?.match(/\b((?:[01]\d|2[0-3]):[0-5]\d)(?:\s*-\s*((?:[01]\d|2[0-3]):[0-5]\d))?/);
  const tags = [...String(html || '').matchAll(
    /class=["'][^"']*\bevent-detail-category-tag\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  )].map((match) => text(match[1])).filter(Boolean);

  return {
    title,
    date_start: `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}`,
    time_start: times?.[1] || null,
    date_end: null,
    time_end: times?.[2] || null,
    venue: 'last by Schachermayer',
    address: 'Lastenstraße 42',
    town: src.town || 'Linz',
    categories: categoriesFor(`${title} ${tags.join(' ')}`),
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    description: null,
    source_url: detailUrl,
  };
}

function viennaYearMonth(offset) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function fetchLastSpaceEvents(src = { url: LAST_SPACE_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  maxMonths = DEFAULT_MAX_MONTHS,
  shellHtml = null,
} = {}) {
  const sourceUrl = src.url || LAST_SPACE_SOURCE_URL;
  if (!(await robotsFn(sourceUrl))) return [];
  const details = new Set();

  for (let offset = 0; offset < maxMonths; offset++) {
    let html = offset === 0 ? shellHtml : null;
    const listingUrl = offset === 0 ? sourceUrl : (() => {
      const url = new URL('/index.php', sourceUrl);
      url.searchParams.set('page', 'event');
      url.searchParams.set('filter_year_month', viennaYearMonth(offset));
      return url.toString();
    })();
    try {
      if (html == null) {
        if (!(await robotsFn(listingUrl))) break;
        const response = await fetchImpl(listingUrl);
        if (!response?.ok) break;
        html = await response.text();
      }
      for (const link of lastSpaceDetailLinks(html, listingUrl)) details.add(link);
    } catch { break; }
  }

  const events = [];
  for (const detailUrl of details) {
    try {
      if (!(await robotsFn(detailUrl))) continue;
      const response = await fetchImpl(detailUrl);
      if (!response?.ok) continue;
      const event = parseLastSpaceDetail(await response.text(), detailUrl, src);
      if (event) events.push(event);
    } catch { /* one broken detail page must not abort the calendar */ }
  }
  return events;
}
