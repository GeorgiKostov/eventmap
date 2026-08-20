// Two-hop deterministic adapter for Salzburgarena's TYPO3 calendar.
//
// The registered page is a client-rendered shell. It publishes the official
// fragment URL in `data-api-url`; that fragment contains dated event cards,
// while each card's detail page carries the richer schema.org/Event JSON-LD.
// Facts only: descriptions stay null, and missing dates/times are never
// guessed.

import { politeFetch, robotsAllowed } from './crawl-net.js';
import { decodeEntities, stripTags } from './entities.js';
import { parseJsonLdEvents } from './jsonld-events.js';

export const SALZBURGARENA_SOURCE_URL = 'https://www.salzburgarena.at/de/events-tickets/';
const DETAIL_CAP = 100;

const DE_MONTHS = {
  januar: '01', februar: '02', märz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

function absoluteUrl(href, base) {
  if (!href) return null;
  try { return new URL(decodeEntities(href), base).toString(); } catch { return null; }
}

function attribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? decodeEntities(match[1]) : null;
}

function classBlock(html, className) {
  const match = String(html || '').match(new RegExp(
    `<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i',
  ));
  return match ? stripTags(match[1]) : null;
}

function parseCardDate(text) {
  const match = String(text || '').match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/);
  if (!match) return null;
  const month = DE_MONTHS[match[2].toLowerCase()];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, '0')}` : null;
}

// The detail page's JSON-LD currently carries the date but not the start
// time. Its dedicated opening-hours info block carries the official time; do
// not search free-form prose for a time because event descriptions mention
// unrelated hours as well.
function openingTimeForDate(html, date) {
  const blocks = [...String(html || '').matchAll(
    /<[^>]+class=["'][^"']*\bevent-detail-content--opening-hours-info\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi,
  )];
  for (const block of blocks) {
    const text = stripTags(block[1]);
    const date_start = parseCardDate(text);
    const time = text.match(/(?:,|\|)\s*(\d{1,2}:\d{2})\s*Uhr/i);
    if (date_start === date && time) return time[1].padStart(5, '0');
  }
  return null;
}

// Discover the official fragment URL from the server-rendered calendar shell.
export function salzburgarenaApiUrl(html, baseUrl = SALZBURGARENA_SOURCE_URL) {
  const match = String(html || '').match(/data-api-url\s*=\s*["']([^"']+)["']/i);
  return match ? absoluteUrl(match[1], baseUrl) : null;
}

// Parse the official API fragment into dated detail-card descriptors. The
// fragment is HTML rather than JSON, so this is intentionally scoped to the
// site's stable `events-overview-item` markers.
export function parseSalzburgarenaOverview(html, baseUrl = SALZBURGARENA_SOURCE_URL) {
  const cards = [];
  const anchors = [...String(html || '').matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)];
  for (const match of anchors) {
    const anchor = match[0];
    const tag = anchor.match(/^<a\b[^>]*>/i)?.[0] || '';
    if (!/\bevents-overview-item\b/i.test(attribute(tag, 'class') || '')) continue;
    const source_url = absoluteUrl(attribute(tag, 'href'), baseUrl);
    const title = classBlock(anchor, 'events-overview-item__title');
    const date_start = parseCardDate(classBlock(anchor, 'events-overview-item__date'));
    const venue = classBlock(anchor, 'events-overview-item__category-inner');
    if (!source_url || !title || !date_start) continue;
    cards.push({ title, date_start, venue: venue || null, source_url });
  }
  return cards;
}

function fallbackEvent(card, src) {
  return {
    title: card.title,
    date_start: card.date_start,
    time_start: null,
    date_end: null,
    time_end: null,
    venue: card.venue || null,
    address: null,
    town: src?.town || null,
    categories: [],
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    description: null,
    source_url: card.source_url,
  };
}

// Parse one official detail page. JSON-LD is authoritative for exact facts;
// the card is only a dated fallback for a detail page with no usable Event.
export function parseSalzburgarenaDetail(html, url, card = {}, src = {}) {
  const events = parseJsonLdEvents(html, { town: src.town || null });
  if (events.length) {
    return events.map((event) => ({
      ...event,
      title: event.title?.trim() || event.title,
      time_start: event.time_start || openingTimeForDate(html, event.date_start),
      source_url: url,
      town: event.town || src.town || null,
    }));
  }
  if (!card.title || !card.date_start) return [];
  return [{ ...fallbackEvent({ ...card, source_url: url }, src), time_start: openingTimeForDate(html, card.date_start) }];
}

// Full two-hop crawl: shell -> official HTML fragment -> detail JSON-LD.
// fetchFn/robotsFn are injectable so the orchestration is testable without
// waiting on the shared host politeness queue or touching the live site.
export async function fetchSalzburgarenaEvents(src = { url: SALZBURGARENA_SOURCE_URL }, {
  maxDetails = DETAIL_CAP,
  fetchFn = politeFetch,
  robotsFn = robotsAllowed,
  shellHtml = null,
} = {}) {
  const sourceUrl = src.url || SALZBURGARENA_SOURCE_URL;
  if (!(await robotsFn(sourceUrl))) return [];

  let shell = shellHtml;
  if (shell == null) {
    try {
      const response = await fetchFn(sourceUrl);
      if (!response.ok) return [];
      shell = await response.text();
    } catch { return []; }
  }

  const apiUrl = salzburgarenaApiUrl(shell, sourceUrl);
  if (!apiUrl || !(await robotsFn(apiUrl))) return [];

  let fragment;
  try {
    const response = await fetchFn(apiUrl);
    if (!response.ok) return [];
    fragment = await response.text();
  } catch { return []; }

  const cards = parseSalzburgarenaOverview(fragment, apiUrl).slice(0, maxDetails);
  const events = [];
  for (const card of cards) {
    let detail;
    try {
      if (!(await robotsFn(card.source_url))) {
        events.push(fallbackEvent({ ...card }, src));
        continue;
      }
      const response = await fetchFn(card.source_url);
      if (!response.ok) {
        events.push(fallbackEvent(card, src));
        continue;
      }
      detail = await response.text();
    } catch {
      events.push(fallbackEvent(card, src));
      continue;
    }
    events.push(...parseSalzburgarenaDetail(detail, card.source_url, card, src));
  }
  return events;
}
