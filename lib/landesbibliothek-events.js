// OÖ Landesbibliothek: deterministic adapter for the TYPO3 news-list at /veranstaltungen
// (paged as /veranstaltungen/seite-N). Facts only: date, time, title, detail link.
// The coloured label above a title is sometimes a status ("Ausgebucht"), so it is not a category.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const LANDESBIBLIOTHEK_SOURCE_URL = 'https://www.landesbibliothek.at/veranstaltungen';
const MAX_PAGES = 5;

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim();
}

export function parseLandesbibliothekEvents(html, src = {}) {
  const base = src.url || LANDESBIBLIOTHEK_SOURCE_URL;
  const page = String(html || '');
  const starts = [...page.matchAll(/<div\b[^>]*class="[^"]*\bnews-list-item\b[^"]*"[^>]*>/g)];
  const events = [];
  for (let i = 0; i < starts.length; i++) {
    const card = page.slice(starts[i].index, starts[i + 1]?.index || page.length);
    const date = card.match(/class="date">\s*(\d{2})\.(\d{2})\.(\d{2})\s*</);
    const time = text(card.match(/<em>([\s\S]*?)<\/em>/)?.[1]).match(/((?:[01]?\d|2[0-3]):[0-5]\d)(?:\s*[-–]\s*((?:[01]?\d|2[0-3]):[0-5]\d))?/);
    const title = text(card.match(/itemprop="headline"[^>]*>([\s\S]*?)<\/p>/)?.[1]);
    const href = card.match(/href="([^"]*\/veranstaltungen\/detail\/[^"]+)"/)?.[1];
    if (!date || !title || !href) continue;
    const date_start = `20${date[3]}-${date[2]}-${date[1]}`;
    const dt = new Date(`${date_start}T12:00:00Z`);
    if (!Number.isFinite(dt.getTime()) || dt.toISOString().slice(0, 10) !== date_start) continue;
    const pad = (t) => (t && t.length === 4 ? `0${t}` : t || null);
    const label = text(card.match(/class="text-primary[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1]);
    const categories = ['culture'];
    if (/kind|famil|jugend/i.test(`${title} ${label}`)) categories.push('family');
    if (/workshop|kurs/i.test(`${title} ${label}`)) categories.push('workshop');
    events.push({
      title, date_start, time_start: pad(time?.[1]), date_end: null, time_end: pad(time?.[2]),
      venue: 'OÖ Landesbibliothek', address: 'Schillerstraße 50, 4020 Linz', town: src.town || 'Linz',
      categories, is_free: null, age_min: null, age_max: null, indoor: true, description: null,
      source_url: new URL(decodeEntities(href), base).toString(),
    });
  }
  return events;
}

function nextPageUrl(html, base) {
  const m = String(html || '').match(/<li class="page-item next">\s*<a href="([^"]+)"/);
  if (!m) return null;
  try {
    const u = new URL(decodeEntities(m[1]), base);
    return u.hostname === new URL(base).hostname && /\/veranstaltungen\/seite-\d+$/.test(u.pathname) ? u.toString() : null;
  } catch { return null; }
}

export async function fetchLandesbibliothekEvents(src = { url: LANDESBIBLIOTHEK_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch, robotsFn = robotsAllowed, shellHtml = null, maxPages = MAX_PAGES,
} = {}) {
  let url = src.url || LANDESBIBLIOTHEK_SOURCE_URL;
  const events = [];
  const seen = new Set();
  const visited = new Set();
  for (let page = 0; url && page < maxPages && !visited.has(url); page++) {
    visited.add(url);
    let html = page === 0 ? shellHtml : null;
    if (html == null) {
      if (!(await robotsFn(url))) break;
      try {
        const res = await fetchImpl(url);
        if (!res?.ok) break;
        html = await res.text();
      } catch { break; }
    } else if (!(await robotsFn(url))) return [];
    for (const ev of parseLandesbibliothekEvents(html, { ...src, url: src.url || LANDESBIBLIOTHEK_SOURCE_URL })) {
      if (seen.has(ev.source_url)) continue;
      seen.add(ev.source_url);
      events.push(ev);
    }
    url = nextPageUrl(html, url);
  }
  return events;
}
