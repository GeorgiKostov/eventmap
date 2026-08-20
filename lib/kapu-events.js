// Deterministic adapter for KAPU's server-rendered Drupal event listing.

import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const KAPU_SOURCE_URL = 'https://www.kapu.or.at/events';
const DEFAULT_MAX_PAGES = 10;

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim() || null;
}

function absoluteUrl(href, base) {
  try { return href ? new URL(decodeEntities(href), base).toString() : null; } catch { return null; }
}

function categoriesFor(value) {
  const source = String(value || '').toLowerCase();
  const categories = [];
  if (/konzert|musik|metal|rock|punk|jazz|festival|band|dj/.test(source)) categories.push('music');
  if (/festival/.test(source)) categories.push('festival');
  if (/kind|famil|jugend/.test(source)) categories.push('family');
  if (/workshop|kurs|seminar/.test(source)) categories.push('workshop');
  if (/theater|tanz|film|literatur|lesung|ausstellung/.test(source)) categories.push('culture');
  return [...new Set(categories)];
}

export function parseKapuPage(html, src = {}) {
  const baseUrl = src.url || KAPU_SOURCE_URL;
  const starts = [...String(html || '').matchAll(
    /<article\b[^>]*class=["'][^"']*\bnode\s+event\s+event--listing\b[^"']*["'][^>]*>/gi,
  )];
  const events = [];
  for (let i = 0; i < starts.length; i++) {
    const card = html.slice(starts[i].index, starts[i + 1]?.index || html.length);
    const title = text(card.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
    const link = card.match(/href=["']([^"']*\/index\.php\/event\/[^"']+)["']/i);
    const dateText = text(card.match(/class=["'][^"']*\bdisplay-5\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const date = dateText?.match(/(?:Mo|Di|Mi|Do|Fr|Sa|So)\.\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*((?:[01]\d|2[0-3]):[0-5]\d)/i);
    const genre = text(card.match(/class=["'][^"']*\bfront-type\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    if (!title || !link || !date || /^abgesagt\s*:/i.test(title)) continue;
    events.push({
      title,
      date_start: `${date[3]}-${date[2]}-${date[1].padStart(2, '0')}`,
      time_start: date[4],
      date_end: null,
      time_end: null,
      venue: 'KAPU',
      address: null,
      town: src.town || 'Linz',
      categories: categoriesFor(`${title} ${genre || ''}`),
      is_free: null,
      age_min: null,
      age_max: null,
      indoor: null,
      description: null,
      source_url: absoluteUrl(link[1], baseUrl),
    });
  }
  return events;
}

function maxPage(html) {
  const pages = [...String(html || '').matchAll(/[?&]page=(\d+)/gi)].map((m) => Number(m[1]));
  return Math.min(DEFAULT_MAX_PAGES, Math.max(0, ...pages));
}

export async function fetchKapuEvents(src = { url: KAPU_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  maxPages = DEFAULT_MAX_PAGES,
  shellHtml = null,
} = {}) {
  const sourceUrl = src.url || KAPU_SOURCE_URL;
  if (!(await robotsFn(sourceUrl))) return [];
  let html = shellHtml;
  if (html == null) {
    try {
      const response = await fetchImpl(sourceUrl);
      if (!response?.ok) return [];
      html = await response.text();
    } catch { return []; }
  }

  const events = [];
  const seen = new Set();
  const pageLimit = Math.min(maxPages, maxPage(html));
  for (let page = 0; page <= pageLimit; page++) {
    if (page > 0) {
      const pageUrl = new URL(sourceUrl);
      pageUrl.searchParams.set('page', String(page));
      const url = pageUrl.toString();
      if (!(await robotsFn(url))) break;
      try {
        const response = await fetchImpl(url);
        if (!response?.ok) break;
        html = await response.text();
      } catch { break; }
    }
    for (const event of parseKapuPage(html, src)) {
      const key = `${event.source_url}|${event.date_start}|${event.time_start || ''}`;
      if (!event.source_url || seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
  }
  return events;
}
