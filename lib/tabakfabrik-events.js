// Deterministic two-hop adapter for Tabakfabrik Linz.
// Listing cards expose the detail URL and visible time; each detail page
// publishes schema.org Event JSON-LD with reliable full dates/ranges.

import { decodeEntities, stripTags } from './entities.js';
import { parseJsonLdEvents } from './jsonld-events.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const TABAKFABRIK_SOURCE_URL = 'https://tabakfabrik-linz.at/events/';
const DEFAULT_MAX_PAGES = 10;

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim() || null;
}

function absoluteUrl(href, base) {
  try { return href ? new URL(decodeEntities(href), base).toString() : null; } catch { return null; }
}

function timeRange(value) {
  const match = String(value || '').match(/((?:[01]\d|2[0-3]):[0-5]\d)(?:\s*-\s*((?:[01]\d|2[0-3]):[0-5]\d))?/);
  return { time_start: match?.[1] || null, time_end: match?.[2] || null };
}

function cardStarts(html) {
  return [...String(html || '').matchAll(
    /<div\b[^>]*class=["'][^"']*\bevent-item-wrapper\b[^"']*["'][^>]*>/gi,
  )];
}

export function parseTabakfabrikListing(html, src = {}) {
  const baseUrl = src.url || TABAKFABRIK_SOURCE_URL;
  const starts = cardStarts(html);
  const cards = [];
  for (let i = 0; i < starts.length; i++) {
    const card = html.slice(starts[i].index, starts[i + 1]?.index || html.length);
    const link = card.match(/class=["'][^"']*\bevent-link-overlay\b[^"']*["'][^>]*href=["']([^"']+)["']/i)
      || card.match(/class=["'][^"']*\bevent_link\b[^"']*["'][^>]*href=["']([^"']+)["']/i);
    const title = text(card.match(/class=["'][^"']*\bslider-title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    const venue = text(card.match(/class=["'][^"']*\blocation\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const time = text(card.match(/class=["'][^"']*\btime\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const detailUrl = absoluteUrl(link?.[1], baseUrl);
    if (!detailUrl || !title) continue;
    cards.push({ detail_url: detailUrl, title, venue, ...timeRange(time) });
  }
  return cards;
}

function pageLinks(html, src) {
  const baseUrl = src.url || TABAKFABRIK_SOURCE_URL;
  return [...new Set([...String(html || '').matchAll(/href=["']([^"']*\/events\/page\/\d+\/?[^"']*)["']/gi)]
    .map((m) => absoluteUrl(m[1], baseUrl)).filter(Boolean))];
}

export async function fetchTabakfabrikEvents(src = { url: TABAKFABRIK_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  maxPages = DEFAULT_MAX_PAGES,
  shellHtml = null,
} = {}) {
  const sourceUrl = src.url || TABAKFABRIK_SOURCE_URL;
  if (!(await robotsFn(sourceUrl))) return [];
  let html = shellHtml;
  if (html == null) {
    try {
      const response = await fetchImpl(sourceUrl);
      if (!response?.ok) return [];
      html = await response.text();
    } catch { return []; }
  }

  const cards = new Map();
  const pages = [sourceUrl];
  const visitedPages = new Set();
  while (pages.length && visitedPages.size < maxPages) {
    const pageUrl = pages.shift();
    if (visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);
    if (pageUrl !== sourceUrl) {
      if (!(await robotsFn(pageUrl))) continue;
      try {
        const response = await fetchImpl(pageUrl);
        if (!response?.ok) continue;
        html = await response.text();
      } catch { continue; }
    }
    for (const card of parseTabakfabrikListing(html, src)) cards.set(card.detail_url, card);
    for (const next of pageLinks(html, src)) if (!visitedPages.has(next)) pages.push(next);
  }

  const events = [];
  for (const card of cards.values()) {
    if (!(await robotsFn(card.detail_url))) continue;
    try {
      const response = await fetchImpl(card.detail_url);
      if (!response?.ok) continue;
      const detailEvents = parseJsonLdEvents(await response.text(), { ...src, url: card.detail_url });
      const event = detailEvents[0];
      if (!event) continue;
      events.push({
        ...event,
        title: card.title,
        time_start: card.time_start,
        time_end: card.time_end,
        venue: card.venue || event.venue,
        town: event.town || src.town || 'Linz',
        source_url: card.detail_url,
      });
    } catch { /* one detail page must not abort the calendar */ }
  }
  return events;
}
