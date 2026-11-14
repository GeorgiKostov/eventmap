// OÖ Familienkarte calendar (familienkarte.at). Server-rendered, 25 `eventEntry`
// blocks per page, paginated via /limitstart.N.html. Facts only: no prose, no images.
import { stripTags, decodeEntities } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const FAMILIENKARTE_SOURCE_URL = 'https://www.familienkarte.at/de/freizeit/veranstaltungen/veranstaltungskalender.html';
const PAGE_SIZE = 25;
const MAX_PAGES = 12;

function isoDate(d, m, y) {
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const stamp = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === date ? date : null;
}

export function parseFamilienkarteEvents(html, src = {}) {
  const base = src.url || FAMILIENKARTE_SOURCE_URL;
  const events = [];
  const seen = new Set();
  for (const block of String(html || '').split(/<div\b(?=[^>]*\bclass=["']eventEntry["'])/i).slice(1)) {
    const summary = block.match(/<div\b[^>]*class=["']summary["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const title = stripTags(summary.match(/<strong>([\s\S]*?)<\/strong>/i)?.[1]);
    const dm = summary.match(/\bam\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const date = dm && isoDate(dm[1], dm[2], dm[3]);
    if (!title || !date) continue; // never fabricate a date
    let time_start = null, time_end = null;
    const tm = summary.match(/von\s+([01]?\d|2[0-3]):([0-5]\d)\s*Uhr(?:\s+bis\s+([01]?\d|2[0-3]):([0-5]\d)\s*Uhr)?/);
    if (tm) {
      time_start = `${tm[1].padStart(2, '0')}:${tm[2]}`;
      time_end = tm[3] ? `${tm[3].padStart(2, '0')}:${tm[4]}` : null;
      // 00:00-23:59 is the publisher's "all day" placeholder, not a real time.
      if (time_start === '00:00' && time_end === '23:59') time_start = time_end = null;
      else if (time_end && time_end < time_start) time_end = null;
    }
    const loc = decodeEntities(stripTags(summary.replace(/<strong>[\s\S]*?<\/strong>/i, '').split(/<br\s*\/?>/i).pop()));
    const town = loc.match(/\b(\d{4})\s+(.+)$/)?.[2]?.trim() || null;
    const href = block.match(/href=["']([^"']*\/key\.\d+\.html)["']/i)?.[1];
    if (!town || !href) continue;
    let source_url;
    try { source_url = new URL(decodeEntities(href), base).href; } catch { continue; }
    const key = `${source_url}|${date}|${time_start}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      title, date_start: date, time_start, date_end: null, time_end,
      venue: null, address: null, town, categories: ['family'],
      is_free: null, age_min: null, age_max: null, indoor: null,
      description: null, source_url,
    });
  }
  return events;
}

export function familienkarteUrl(baseUrl, page) {
  return page === 0 ? baseUrl : baseUrl.replace(/\.html$/, `/limitstart.${page * PAGE_SIZE}.html`);
}

export async function fetchFamilienkarteEvents(src = {}, {
  shellHtml = null,
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  maxPages = MAX_PAGES,
} = {}) {
  const base = src.url || FAMILIENKARTE_SOURCE_URL;
  const all = new Map();
  for (let page = 0; page < maxPages; page++) {
    let html = page === 0 ? shellHtml : null;
    if (html == null) {
      const url = familienkarteUrl(base, page);
      if (!(await robotsFn(url))) { if (page === 0) return []; break; }
      const res = await fetchImpl(url);
      if (!res?.ok) { if (page === 0) throw new Error(`Familienkarte HTTP ${res?.status}`); break; }
      html = await res.text();
    }
    const before = all.size;
    for (const e of parseFamilienkarteEvents(html, src)) {
      all.set(`${e.source_url}|${e.date_start}|${e.time_start}`, e);
    }
    if (all.size === before) break; // page added nothing new
  }
  return [...all.values()];
}
