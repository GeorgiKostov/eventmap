// Deterministic adapter for the official Posthof Linz programme.
//
// The programme is server-rendered in ten-event pages. The next page is an
// HTMX POST URL embedded in the current page; following those URLs keeps the
// crawl independent of a browser and avoids copying detail-page prose/images.
// Facts-only: dates, times, titles, venue and official detail link come from
// the programme cards. Every URL is checked against robots.txt before use.

import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const POSTHOF_SOURCE_URL = 'https://www.posthof.at/';
const DEFAULT_MAX_PAGES = 20;

const MONTHS = {
  jan: '01', januar: '01', feb: '02', februar: '02', mär: '03', märz: '03', mar: '03',
  apr: '04', april: '04', mai: '05', jun: '06', juni: '06', jul: '07', juli: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09',
  okt: '10', oct: '10', oktober: '10', october: '10', nov: '11', november: '11',
  dez: '12', dec: '12', dezember: '12', december: '12',
};

function absoluteUrl(href, base) {
  if (!href) return null;
  try { return new URL(decodeEntities(href), base).toString(); } catch { return null; }
}

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim() || null;
}

function programmeSpans(html) {
  return [...String(html || '').matchAll(
    /<span\b[^>]*class=["'][^"']*\bpr-4\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
  )].map((match) => text(match[1])).filter(Boolean);
}

function eventDateTime(value) {
  const match = String(value || '').match(
    /\b(?:Mo|Di|Mi|Do|Fr|Sa|So)\s+(\d{1,2})\s+([A-Za-zÄÖÜäöüß]+)\s+(\d{2,4})\s+(\d{1,2}:\d{2})\b/i,
  );
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return {
    date_start: `${year}-${month}-${match[1].padStart(2, '0')}`,
    time_start: match[4].padStart(5, '0'),
  };
}

function categoriesForGenre(value) {
  const genre = String(value || '').toLowerCase();
  const categories = [];
  if (/musik|konzert|indie|rock|pop|hip.?hop|electro|electronic|dance|jazz|metal|orchester/.test(genre)) categories.push('music');
  if (/theater|theatre|tanz|kabarett|literatur|lesung|vortrag|performance|klangtheater|impro/.test(genre)) categories.push('culture');
  if (/famil|kind|jugend/.test(genre)) categories.push('family');
  if (/party|club|disco|dance/.test(genre)) categories.push('party');
  return [...new Set(categories)];
}

function nextPageUrl(html, baseUrl) {
  const match = String(html || '').match(
    /<li[^>]*class=["'][^"']*\bloadnext\b[^"']*["'][\s\S]*?<button[^>]*\bhx-post=["']([^"']+)["']/i,
  );
  return match ? absoluteUrl(match[1], baseUrl) : null;
}

export function parsePosthofPage(html, src = {}) {
  const baseUrl = src.url || POSTHOF_SOURCE_URL;
  const events = [];
  for (const match of String(html || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const card = match[1];
    if (/\bloadnext\b/i.test(match[0])) continue;
    const anchor = card.match(/<h2\b[^>]*>\s*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const source_url = absoluteUrl(anchor[1], baseUrl);
    const title = anchor[2].split(/<br\s*\/?\s*>/i).map((part) => text(part)).filter(Boolean).join(': ') || null;
    const cardText = text(card);
    const dateTime = eventDateTime(cardText);
    if (!source_url || !title || !dateTime) continue;
    const spans = programmeSpans(card);
    const dateIndex = spans.findIndex((span) => /^(?:Mo|Di|Mi|Do|Fr|Sa|So)\s+\d{1,2}\s+[A-Za-zÄÖÜäöüß]+\s+\d{2,4}$/i.test(span));
    const genre = dateIndex >= 0 && /^\d{1,2}:\d{2}$/.test(spans[dateIndex + 1] || '')
      ? spans[dateIndex + 2] || null : null;
    events.push({
      title,
      ...dateTime,
      date_end: null,
      time_end: null,
      venue: 'Posthof Linz',
      address: null,
      town: src.town || 'Linz',
      categories: categoriesForGenre(genre),
      is_free: null,
      age_min: null,
      age_max: null,
      indoor: null,
      description: null,
      source_url,
    });
  }
  return { events, next_url: nextPageUrl(html, baseUrl) };
}

export async function fetchPosthofEvents(src = { url: POSTHOF_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  maxPages = DEFAULT_MAX_PAGES,
  shellHtml = null,
} = {}) {
  const sourceUrl = src.url || POSTHOF_SOURCE_URL;
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
  for (let page = 0; page < maxPages && html; page++) {
    const parsed = parsePosthofPage(html, src);
    for (const event of parsed.events) {
      // A programme detail URL can legitimately represent more than one
      // dated occurrence; keep each official card rather than collapsing it.
      const occurrenceKey = `${event.source_url}|${event.date_start}|${event.time_start || ''}`;
      if (seen.has(occurrenceKey)) continue;
      seen.add(occurrenceKey);
      events.push(event);
    }
    if (!parsed.next_url || !(await robotsFn(parsed.next_url))) break;
    try {
      const response = await fetchImpl(parsed.next_url, { method: 'POST' });
      if (!response?.ok) break;
      html = await response.text();
    } catch { break; }
  }
  return events;
}
