// Alpenverein Linz Jugend: deterministic adapter for the Weblication course list.
// Each list entry shows "DD.MM.YYYY [HH:MM] [- DD.MM.YYYY [HH:MM]]" and links to
// office-details-Online.php?veranstaltungID=<uuid>. Many entries are courses/series; start and
// end are emitted exactly as given (the pick policy demotes long spans). Facts only.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const ALPENVEREIN_LINZ_SOURCE_URL = 'https://www.alpenverein.at/linz/jugend/index.php';

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim();
}

const toIso = (s) => {
  const m = s?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const v = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};

export function parseAlpenvereinLinzEvents(html, src = {}) {
  const base = src.url || ALPENVEREIN_LINZ_SOURCE_URL;
  const entries = String(html || '').split(/<li class="listEntry\b/).slice(1);
  const events = [];
  const seen = new Set();
  for (const entry of entries) {
    const id = entry.match(/veranstaltungID=([0-9a-f-]{36})/i)?.[1];
    const title = text(entry.match(/<a href="[^"]*veranstaltungID=[^"]*">([\s\S]*?)<\/a>/i)?.[1]);
    const when = text(entry.match(/\n\s*(\d{2}\.\d{2}\.\d{4}[^<]*?)\s*<\/div>/)?.[1])
      .match(/^(\d{2}\.\d{2}\.\d{4})(?:\s+((?:[01]\d|2[0-3]):[0-5]\d))?(?:\s*-\s*(\d{2}\.\d{2}\.\d{4})(?:\s+((?:[01]\d|2[0-3]):[0-5]\d))?)?$/);
    if (!id || !title || !when || seen.has(id)) continue;
    const date_start = toIso(when[1]);
    if (!date_start) continue;
    seen.add(id);
    const date_end = when[3] ? toIso(when[3]) : null;
    const ort = text(entry.match(/officeveranstaltung_ort_[^>]*>([\s\S]*?)<\/div>/)?.[1]) || null;
    const age = title.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s*Jahre/i);
    const categories = ['family'];
    if (/kletter|boulder|ski|bike|freeride|lawinen|tour|training/i.test(title)) categories.push('sport');
    const link = new URL(`/linz/02_programm/office-details-Online.php?veranstaltungID=${id}`, base);
    events.push({
      title, date_start, time_start: when[2] || null,
      date_end: date_end && date_end !== date_start ? date_end : null,
      time_end: when[4] && (date_end ? true : when[2] && when[4] > when[2]) ? when[4] : null,
      venue: ort, address: null, town: src.town || 'Linz', categories,
      is_free: null, age_min: age ? Number(age[1]) : null, age_max: age ? Number(age[2]) : null,
      indoor: null, description: null, source_url: link.toString(),
    });
  }
  return events;
}

export async function fetchAlpenvereinLinzEvents(src = { url: ALPENVEREIN_LINZ_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch, robotsFn = robotsAllowed, shellHtml = null,
} = {}) {
  const url = src.url || ALPENVEREIN_LINZ_SOURCE_URL;
  if (!(await robotsFn(url))) return [];
  let html = shellHtml;
  if (html == null) {
    try {
      const res = await fetchImpl(url);
      if (!res?.ok) return [];
      html = await res.text();
    } catch { return []; }
  }
  return parseAlpenvereinLinzEvents(html, src);
}
