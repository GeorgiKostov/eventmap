// The main archive currently omits its calendar. The same publisher retains
// static EventON cards on the homepage and its Vater sein project page.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const FAMILIENVERBAND_SOURCE_URL = 'https://familie.or.at/veranstaltungen/';
const FALLBACK_LISTINGS = ['https://familie.or.at/', 'https://familie.or.at/vater-sein/'];

function attribute(tag, name) {
  return decodeEntities(String(tag || '').match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1]);
}

function localDate(value) {
  // EventON's offset remains +2 even in winter. Its visible local time is authoritative.
  const match = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T((?:[01]\d|2[0-3]):[0-5]\d)(?::\d{2})?(?:[+-]\d{1,2}:\d{2})?)?$/);
  if (!match) return null;
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const stamp = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(stamp.getTime()) || stamp.toISOString().slice(0, 10) !== date) return null;
  return { date, time: match[4] || null };
}

function detailUrl(href) {
  try {
    const url = new URL(href, FAMILIENVERBAND_SOURCE_URL);
    return url.origin === 'https://familie.or.at' && /^\/Veranstaltungen\/(?!feed\/)[^/]+\/$/i.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function parseFamilienverbandEvents(html) {
  const events = [];
  const seen = new Set();
  for (const card of String(html || '').split(/<div\b(?=[^>]*\bid=["']event_\d+_\d+["'])/i).slice(1)) {
    const title = stripTags(card.match(/<span\b[^>]*class=["'][^"']*\bevcal_event_title\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const property = (name) => card.match(new RegExp(`<meta\\b[^>]*itemprop=["']${name}["'][^>]*>`, 'i'))?.[0];
    const start = localDate(attribute(property('startDate'), 'content'));
    const end = localDate(attribute(property('endDate'), 'content'));
    const sourceUrl = detailUrl(attribute(card.match(/<a\b[^>]*itemprop=["']url["'][^>]*>/i)?.[0], 'href'));
    const location = card.match(/<span\b[^>]*class=["'][^"']*\bevent_location_attrs\b[^"']*["'][^>]*>/i)?.[0];
    const address = attribute(location, 'data-location_address');
    const venue = attribute(location, 'data-location_name');
    const town = address.match(/(?:^|[\s,])(?:A-)?6\d{3}\s+([^,]+)$/)?.[1]?.trim();
    // Missing locations and multi-day programme/course envelopes are not individual outings.
    // Austrian Vorarlberg postcodes also exclude the publisher's German excursion venues.
    if (!title || !start || !sourceUrl || !venue || !town || !end || start.date !== end.date) continue;
    if (/EventCancelled|EventPostponed/i.test(attribute(property('eventStatus'), 'content'))) continue;
    if (start.time && end.time && end.time < start.time) continue;
    const key = `${sourceUrl}|${start.date}|${start.time}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const family = /kinder|kindes|kids|teens|famil|väter|vater sein/i.test(`${title} ${card.match(/itemprop=["']organizer["'][\s\S]*?<\/div>/i)?.[0] || ''}`);
    const activity = /seminar|kurs|vortrag|prävention|letzte hilfe/i.test(title) ? 'workshop'
      : /bogensch|bikepark|bowling|wander|sport/i.test(title) ? 'sport' : 'culture';
    events.push({
      title,
      date_start: start.date,
      time_start: start.time,
      date_end: end.date,
      time_end: end.time,
      venue,
      address,
      town,
      categories: [...(family ? ['family'] : []), activity],
      is_free: null,
      age_min: null,
      age_max: null,
      indoor: null,
      description: null,
      source_url: sourceUrl,
    });
  }
  return events;
}

export async function fetchFamilienverbandEvents(src = { url: FAMILIENVERBAND_SOURCE_URL }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  shellHtml = null,
} = {}) {
  const read = async (url) => {
    if (!(await robotsFn(url))) throw new Error(`Familienverband robots denied ${url}`);
    const response = await fetchImpl(url);
    if (!response?.ok) throw new Error(`Familienverband calendar HTTP ${response?.status}`);
    return response.text();
  };
  const sourceUrl = src.url || FAMILIENVERBAND_SOURCE_URL;
  if (!(await robotsFn(sourceUrl))) return [];
  const html = shellHtml ?? await read(sourceUrl);
  const direct = parseFamilienverbandEvents(html);
  if (direct.length) return direct;
  const links = new Set(FALLBACK_LISTINGS);
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const url = detailUrl(decodeEntities(match[1]));
    if (url) links.add(url);
  }
  const events = new Map();
  for (const url of links) {
    for (const event of parseFamilienverbandEvents(await read(url))) {
      events.set(`${event.source_url}|${event.date_start}|${event.time_start}`, event);
    }
  }
  if (!events.size) throw new Error('Familienverband calendar returned no dated Austrian venue events');
  return [...events.values()];
}
