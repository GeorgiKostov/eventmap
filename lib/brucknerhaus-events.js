// Deterministic adapter for the official Brucknerhaus Linz programme.
// The listing is server-rendered, with 50 dated cards per page and six pages.
// Facts only: title/date/time/venue/detail URL; descriptions and images are ignored.

import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const BRUCKNERHAUS_SOURCE_URL = 'https://www.brucknerhaus.at/programm/veranstaltungen';
const DEFAULT_MAX_PAGES = 10;

const MONTHS = {
  jan: '01', januar: '01', jänner: '01', feb: '02', februar: '02',
  mär: '03', märz: '03', mar: '03', märz: '03', apr: '04', april: '04',
  mai: '05', jun: '06', juni: '06', jul: '07', juli: '07', aug: '08',
  august: '08', sep: '09', sept: '09', september: '09', okt: '10', oktober: '10',
  nov: '11', november: '11', dez: '12', dezember: '12',
};

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim() || null;
}

function lines(value) {
  return decodeEntities(String(value || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:span|div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function absoluteUrl(href, base) {
  try { return href ? new URL(decodeEntities(href), base).toString() : null; } catch { return null; }
}

function dateFromCard(value, fallbackYear = null) {
  const dateText = text(value);
  // Cards print only a two-digit season year ("26"), and the day can also be
  // two digits ("30"). Use a full printed year when present, otherwise take
  // the four-digit year from the official detail URL rather than mistaking the
  // day for the year.
  const printedYear = dateText?.match(/\b(20\d{2})\b/)?.[1];
  const year = printedYear || fallbackYear;
  const tokens = [...(dateText || '').matchAll(/(?:^|\s)(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)/g)];
  if (!year || !tokens.length) return null;
  const first = tokens[0];
  const month = MONTHS[first[2].toLowerCase()];
  if (!month) return null;
  const end = tokens[1];
  const endMonth = end ? MONTHS[end[2].toLowerCase()] : null;
  return {
    date_start: `${year}-${month}-${first[1].padStart(2, '0')}`,
    date_end: endMonth ? `${year}-${endMonth}-${end[1].padStart(2, '0')}` : null,
  };
}

function categoriesFor(value) {
  const source = String(value || '').toLowerCase();
  const categories = [];
  if (/konzert|musik|orchester|symphonie|jazz|oper|klang/.test(source)) categories.push('music');
  if (/kind|famil|jugend|kids/.test(source)) categories.push('family');
  if (/theater|tanz|literatur|lesung|vortrag|film|ausstellung|galerie/.test(source)) categories.push('culture');
  if (/workshop|kurs|führung|fuehrung|seminar/.test(source)) categories.push('workshop');
  return [...new Set(categories)];
}

export function parseBrucknerhausPage(html, src = {}) {
  const baseUrl = src.url || BRUCKNERHAUS_SOURCE_URL;
  const starts = [...String(html || '').matchAll(
    /<div\b[^>]*class=["'][^"']*\bevent__element\b[^"']*["'][^>]*>/gi,
  )];
  const events = [];
  for (let i = 0; i < starts.length; i++) {
    const card = html.slice(starts[i].index, starts[i + 1]?.index || html.length);
    const link = card.match(/href=["']([^"']*\/programm\/veranstaltungen\/[^"']+)["']/i);
    const title = text(card.match(/class=["'][^"']*\bevent__name\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const subtitle = text(card.match(/class=["'][^"']*\bhome-events__item___subline\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const urlYear = link?.[1].match(/(?:^|[.-])(20\d{2})(?:[.-]|$)/)?.[1] || null;
    const date = dateFromCard(card.match(/class=["'][^"']*\bevent__date\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1], urlYear);
    if (!link || !title || !date) continue;
    const locationBlock = card.match(/class=["'][^"']*\bevent__location\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const locationLines = lines(locationBlock);
    const time = locationLines.find((line) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(line)) || null;
    const venue = locationLines
      .filter((line) => line !== time && line.toLowerCase() !== 'linz')
      .find((line) => /brucknerhaus/i.test(line))
      || locationLines.find((line) => line !== time && line.toLowerCase() !== 'linz')
      || 'Brucknerhaus';
    events.push({
      title,
      date_start: date.date_start,
      time_start: time,
      date_end: date.date_end,
      time_end: null,
      venue,
      address: null,
      town: src.town || 'Linz',
      categories: categoriesFor(`${title} ${subtitle || ''}`),
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
  return Math.min(DEFAULT_MAX_PAGES, Math.max(1, ...pages));
}

export async function fetchBrucknerhausEvents(src = { url: BRUCKNERHAUS_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  maxPages = DEFAULT_MAX_PAGES,
  shellHtml = null,
} = {}) {
  const sourceUrl = src.url || BRUCKNERHAUS_SOURCE_URL;
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
  for (let page = 1; page <= pageLimit; page++) {
    if (page > 1) {
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
    for (const event of parseBrucknerhausPage(html, src)) {
      const key = `${event.source_url}|${event.date_start}|${event.time_start || ''}`;
      if (!event.source_url || seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
  }
  return events;
}
