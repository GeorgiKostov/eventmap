// Treibhaus publishes precise local starts and canonical links as Event microdata.
// Its iCal export has placeholder ends and a shared venue even for offsite shows.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const TREIBHAUS_SOURCE_URL = 'https://treibhaus.at/programm';

export function parseTreibhausEvents(html) {
  const events = [];
  const seen = new Set();
  const cards = String(html || '').split(/<div\b(?=[^>]*\bid=["']event-\d+["'])/i).slice(1);
  for (const card of cards) {
    const title = stripTags(card.match(/<span\b[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const dateTag = card.match(/<span\b[^>]*itemprop=["']startDate["'][^>]*>/i)?.[0];
    const start = dateTag?.match(/\bcontent=["'](\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d):\d{2}["']/);
    const anchor = card.match(/<a\b[^>]*itemprop=["']url["'][^>]*>/i)?.[0];
    const href = decodeEntities(anchor?.match(/\bhref=["']([^"']+)["']/i)?.[1]);
    if (!title || !start || !href) continue;
    const date = new Date(`${start[1]}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start[1]) continue;

    let url;
    try { url = new URL(href, TREIBHAUS_SOURCE_URL); } catch { continue; }
    if (url.origin !== 'https://treibhaus.at' || !/^\/programm\/\d{4}\/\d{2}\/\d{2}\/\d+-/.test(url.pathname)) continue;
    if (url.pathname.split('/').slice(2, 5).join('-') !== start[1] || seen.has(url.href)) continue;

    const summary = stripTags(card.match(/<div\b[^>]*class=["']share-sub["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const facts = `${title} ${summary}`;
    // The feed's Treibhaus location cannot be trusted for explicitly external shows.
    if (/\bcongress\b|\bkongress\b|\bsaal\s+tirol\b|au[ßs]er\s+haus/i.test(facts)) continue;
    const age = [title, summary].map((value) => value.match(
      /\bab\s+(\d{1,2})(?:\s+Jahr(?:en|e)?\b|(?=\s*[).]|$))/i,
    )).find(Boolean);
    const family = /\bkinder\b|\bfamilien?\b|\bherbert\s*&\s*mimi\b/i.test(facts) || age != null;
    const music = /\bkonzert|\bjazz\b|\bmusik|\bmusiker|\bband\b|\bfolk\b|\brock\b|\bhip.?hop\b|\bfunk\b/i.test(facts);
    seen.add(url.href);
    events.push({
      title,
      date_start: start[1],
      time_start: start[2],
      date_end: null,
      time_end: null,
      venue: 'Treibhaus Innsbruck',
      address: 'Angerzellgasse 8, 6020 Innsbruck',
      town: 'Innsbruck',
      categories: [...(family ? ['family'] : []), music ? 'music' : 'culture'],
      is_free: null,
      age_min: age ? Number(age[1]) : null,
      age_max: null,
      indoor: null,
      description: null,
      source_url: url.href,
    });
  }
  return events;
}

export async function fetchTreibhausEvents(src = { url: TREIBHAUS_SOURCE_URL }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  shellHtml = null,
} = {}) {
  const url = src.url || TREIBHAUS_SOURCE_URL;
  if (!(await robotsFn(url))) return [];
  if (shellHtml != null) return parseTreibhausEvents(shellHtml);
  const response = await fetchImpl(url);
  if (!response?.ok) throw new Error(`Treibhaus calendar HTTP ${response?.status}`);
  return parseTreibhausEvents(await response.text());
}
