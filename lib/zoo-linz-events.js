// Zoo Linz: deterministic adapter for the Drupal accordion list. Each row's header reads
// "Fr., 20.11.2026 14:00–15:30 - Title". Facts only; the accordion prose is never read.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const ZOO_LINZ_SOURCE_URL = 'https://www.zoo-linz.at/de/erlebnis-zoo/veranstaltungen';

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim();
}

const iso = (d, m, y) => {
  const s = `${y}-${m}-${d}`;
  const dt = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === s ? s : null;
};

export function parseZooLinzEvents(html, src = {}) {
  const page = String(html || '');
  const events = [];
  const heads = [...page.matchAll(/field--name-field-datum[^>]*>([^<]*)<\/div>([\s\S]*?)<\/span>/g)];
  for (let i = 0; i < heads.length; i++) {
    const when = text(heads[i][1]).match(
      /(\d{2})\.(\d{2})\.(\d{4})(?:\s+((?:[01]\d|2[0-3]):[0-5]\d))?(?:\s*[–-]\s*(?:(\d{2})\.(\d{2})\.(\d{4})\s+)?((?:[01]\d|2[0-3]):[0-5]\d))?/,
    );
    const title = text(heads[i][2]).replace(/^[-–]\s*/, '').trim();
    if (!when || !title) continue;
    const date_start = iso(when[1], when[2], when[3]);
    if (!date_start) continue;
    const date_end = when[5] ? iso(when[5], when[6], when[7]) : null;
    const panel = page.slice(heads[i].index, heads[i + 1]?.index || page.length);
    const adultsOnly = /für Erwachsene|Sachkundenachweis/i.test(`${title} ${text(panel).slice(0, 300)}`);
    events.push({
      title, date_start, time_start: when[4] || null,
      date_end: date_end && date_end !== date_start ? date_end : null,
      time_end: when[8] && when[4] && (date_end || when[8] > when[4]) ? when[8] : null,
      venue: 'Zoo Linz', address: null, town: src.town || 'Linz',
      categories: adultsOnly ? ['workshop'] : ['family'],
      is_free: null, age_min: null, age_max: null, indoor: null, description: null,
      source_url: src.url || ZOO_LINZ_SOURCE_URL,
    });
  }
  return events;
}

export async function fetchZooLinzEvents(src = { url: ZOO_LINZ_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch, robotsFn = robotsAllowed, shellHtml = null,
} = {}) {
  const url = src.url || ZOO_LINZ_SOURCE_URL;
  if (!(await robotsFn(url))) return [];
  let html = shellHtml;
  if (html == null) {
    try {
      const res = await fetchImpl(url);
      if (!res?.ok) return [];
      html = await res.text();
    } catch { return []; }
  }
  return parseZooLinzEvents(html, src);
}
