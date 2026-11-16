// Landestheater Linz: deterministic adapter for the server-rendered /termine list.
// The page renders ~100 performances per request (cap), grouped under German day
// headings ("Dienstag, 17. November 2026"). The site's own list widget pages by
// POSTing `cal=D.M.YYYY` to /DE/repos/evoscripts/lth/getEvents (same fragment,
// starting at that day) — we follow that for ~8 weeks. Facts only: title, date,
// time, stage, Sparte. No descriptions, no images. Closed performances skipped.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const LANDESTHEATER_SOURCE_URL = 'https://www.landestheater-linz.at/termine';
const LIST_ENDPOINT = '/DE/repos/evoscripts/lth/getEvents';
const HORIZON_DAYS = 56;
const MAX_PAGES = 6;

const MONTHS = {
  januar: 1, jaenner: 1, jänner: 1, februar: 2, feber: 2, märz: 3, maerz: 3, april: 4, mai: 5,
  juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

// Stage -> street address (public venue addresses; the page itself only names the stage).
const ADDRESSES = [
  [/Musiktheater|Orchestersaal/i, 'Am Volksgarten 1, 4020 Linz'],
  [/Schauspielhaus|Kammerspiele|Studiobühne/i, 'Promenade 39, 4020 Linz'],
  [/Brucknerhaus/i, 'Untere Donaulände 7, 4010 Linz'],
  [/Francisco Carolinum/i, 'Museumstraße 14, 4020 Linz'],
];
const STAGE_RE = /\b(Saal|Kammerspiele|Schauspielhaus|Studiobühne|BlackBox|Foyer|Orchestersaal|Brucknerhaus|Francisco Carolinum|Lounge|Bühne)\b/i;

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim();
}

function parseGermanDate(value) {
  const m = text(value).toLowerCase().match(/(\d{1,2})\.\s*([a-zäöü]+)\s+(\d{4})/);
  const month = m && MONTHS[m[2]];
  if (!month) return null;
  const iso = `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseLandestheaterEvents(html, src = {}) {
  const page = String(html || '');
  const baseUrl = src.url || LANDESTHEATER_SOURCE_URL;
  const tokens = [
    ...[...page.matchAll(/class="lth-evitem-date">[\s\S]*?<span class="lth-book">([\s\S]*?)<\/span>/g)]
      .map((m) => ({ at: m.index, kind: 'day', value: m[1] })),
    ...[...page.matchAll(/<div id="event-(\d*)" class="lth-evitem"/g)]
      .map((m) => ({ at: m.index, kind: 'event', id: m[1] })),
  ].sort((a, b) => a.at - b.at);
  const events = [];
  let day = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'day') { day = parseGermanDate(t.value); continue; }
    if (!day) continue;
    let next = i + 1;
    while (next < tokens.length && tokens[next].kind !== 'day' && tokens[next].kind !== 'event') next++;
    const block = page.slice(t.at, tokens[next]?.at ?? page.length);
    const title = text(block.match(/class="lth-evitem-title">([\s\S]*?)<\/div>/)?.[1]);
    const type = text(block.match(/class="lth-evitem-type"[^>]*>([\s\S]*?)<\/div>/)?.[1]);
    const body = block.match(/class="lth-evitem-text">([\s\S]*?)<ltl-eventcast/)?.[1] || '';
    const visible = text(body);
    if (!title || /Geschlossene Vorstellung/i.test(visible)) continue;
    const time = text(block.match(/class="lth-evitem-time"[^>]*>([\s\S]*?)<\/div>/)?.[1])
      .match(/((?:[01]\d|2[0-3]):[0-5]\d)(?:\s*-\s*((?:[01]\d|2[0-3]):[0-5]\d))?/);
    const time_start = time?.[1] || null;
    const time_end = time?.[2] && time_start && time[2] > time_start ? time[2] : null;
    // Stage = first plain line of the info block (after the composer span), if it names a stage.
    const firstLine = body.replace(/<span class='komponist'>[\s\S]*?<\/span>/, '').split(/<br\s*\/?>/i)
      .map(text).find(Boolean) || '';
    const stage = STAGE_RE.test(firstLine) ? firstLine : null;
    const address = stage ? (ADDRESSES.find(([re]) => re.test(stage))?.[1] || null) : null;
    const ageMatch = title.match(/\|\s*(\d{1,2})\+\s*$/);
    const age_min = ageMatch ? Number(ageMatch[1]) : null;
    const cleanTitle = ageMatch ? title.replace(/\s*\|\s*\d{1,2}\+\s*$/, '').trim() : title;
    const categories = ['culture'];
    if (/^(Konzert|Oper|Operette)$/i.test(type)) categories.push('music');
    if (/^Junges Theater$/i.test(type) || /jedes Kind/i.test(visible) || /\b(kids?|kinder|familie)/i.test(cleanTitle) || (age_min != null && age_min <= 12)) categories.push('family');
    const link = new URL(baseUrl);
    link.hash = t.id ? `event-${t.id}` : '';
    events.push({
      title: cleanTitle, date_start: day, time_start, date_end: null, time_end,
      venue: stage || 'Landestheater Linz',
      address, town: src.town || 'Linz', categories,
      is_free: /\bkostenlos|kostenlose Zählkarten/i.test(visible) ? true : null,
      age_min, age_max: null, indoor: true, description: null,
      source_url: link.toString(),
    });
  }
  return events;
}

function calParam(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}.${m}.${y}`;
}

export async function fetchLandestheaterEvents(src = { url: LANDESTHEATER_SOURCE_URL, town: 'Linz' }, {
  fetchImpl = politeFetch, robotsFn = robotsAllowed, shellHtml = null, maxPages = MAX_PAGES, horizonDays = HORIZON_DAYS,
} = {}) {
  const sourceUrl = src.url || LANDESTHEATER_SOURCE_URL;
  if (!(await robotsFn(sourceUrl))) return [];
  let html = shellHtml;
  if (html == null) {
    try {
      const res = await fetchImpl(sourceUrl);
      if (!res?.ok) return [];
      html = await res.text();
    } catch { return []; }
  }
  const endpoint = new URL(LIST_ENDPOINT, sourceUrl).toString();
  const events = [];
  const seen = new Set();
  let horizon = null;
  let last = null;
  for (let page = 0; page < maxPages; page++) {
    const parsed = parseLandestheaterEvents(html, src);
    if (!parsed.length) break;
    for (const ev of parsed) {
      const key = `${ev.title}|${ev.date_start}|${ev.time_start}|${ev.venue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
    const dates = parsed.map((e) => e.date_start).sort();
    if (!horizon) horizon = new Date(new Date(`${dates[0]}T12:00:00Z`).getTime() + horizonDays * 86400000).toISOString().slice(0, 10);
    const newest = dates.at(-1);
    if (newest >= horizon || (last && newest <= last)) break;
    last = newest;
    if (!(await robotsFn(endpoint))) break;
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `cal=${encodeURIComponent(calParam(newest))}`,
      });
      if (!res?.ok) break;
      html = await res.text();
    } catch { break; }
  }
  return events;
}
