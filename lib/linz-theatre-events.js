// Theatre dates and ages from the official visible performance list.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const THEATER_DES_KINDES_SOURCE_URL = 'https://theater-des-kindes.at/spielplan/';

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim();
}

export function parseTheaterDesKindesEvents(html, src = {}) {
  const headings = [...String(html || '').matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  const events = [];
  for (let i = 0; i < headings.length; i++) {
    const block = html.slice(headings[i].index, headings[i + 1]?.index || html.length);
    const href = decodeEntities(block.match(/href=["']([^"']*\/vorstellung\/[^"']+)["']/i)?.[1] || '');
    const visible = text(block);
    const date = visible.match(/\b(\d{2})\.(\d{2})\.(\d{4}),\s*((?:[01]\d|2[0-3]):[0-5]\d)\s*Uhr/);
    if (!href || !date || /\babgesagt\b|\bentfällt\b/i.test(visible)) continue;
    const date_start = `${date[3]}-${date[2]}-${date[1]}`;
    const parsed = new Date(`${date_start}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date_start) continue;
    const link = new URL(href, src.url || THEATER_DES_KINDES_SOURCE_URL);
    if (link.hostname !== 'theater-des-kindes.at' || !link.pathname.startsWith(`/vorstellung/${date_start}-${date[4].replace(':', '')}-`)) continue;
    const title = text(headings[i][1]);
    if (!title) continue;
    const age = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((p) => text(p[1])).find((value) => /^\d+\+$/.test(value));
    events.push({
      title, date_start, time_start: date[4], date_end: null, time_end: null,
      venue: 'Theater des Kindes', address: 'Langgasse 13, 4020 Linz',
      town: src.town || 'Linz', categories: ['culture', 'family'],
      is_free: null, age_min: age ? Number(age.slice(0, -1)) : null,
      age_max: null, indoor: null, description: null, source_url: link.toString(),
    });
  }
  return events;
}

export function theaterDesKindesNextPage(html, base = THEATER_DES_KINDES_SOURCE_URL) {
  for (const match of String(html || '').matchAll(/<a\b[^>]*>/gi)) {
    if (!/\bpods-pagination-next\b/.test(match[0])) continue;
    const href = decodeEntities(match[0].match(/href=["']([^"']+)["']/i)?.[1] || '');
    const link = new URL(href, base);
    if (link.hostname === 'theater-des-kindes.at' && link.pathname === '/spielplan/' && /^\d+$/.test(link.searchParams.get('pg') || '')) return link.toString();
  }
  return null;
}

export async function fetchTheaterDesKindesEvents(src, {
  initialHtml, maxPages = 12, fetchImpl = politeFetch, robotsFn = robotsAllowed,
} = {}) {
  let url = src.url || THEATER_DES_KINDES_SOURCE_URL;
  const pages = new Set();
  const events = new Map();
  for (let page = 0; url && page < maxPages && !pages.has(url); page++) {
    pages.add(url);
    let html = page === 0 ? initialHtml : null;
    if (html == null) {
      if (!await robotsFn(url)) throw new Error(`Theater des Kindes robots disallows ${url}`);
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`Theater des Kindes calendar returned ${response.status}`);
      html = await response.text();
    }
    const parsed = parseTheaterDesKindesEvents(html, src);
    for (const event of parsed) events.set(event.source_url, event);
    url = theaterDesKindesNextPage(html, url);
  }
  return [...events.values()];
}
