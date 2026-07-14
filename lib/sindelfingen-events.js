// Facts-only parser for the official Stadt Sindelfingen TYPO3 event list.

import { decodeEntities as decode, stripTags as text } from './entities.js';

function isoDate(value) {
  const match = String(value || '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function times(value) {
  if (!value || /ganztägig/i.test(value)) return { start: null, end: null };
  const matches = [...value.matchAll(/\b(\d{1,2}):(\d{2})\b/g)]
    .map((match) => `${match[1].padStart(2, '0')}:${match[2]}`);
  return { start: matches[0] || null, end: matches[1] || null };
}

const CATEGORY_RULES = [
  [/Kinder|Familie|Ferienprogramm/i, 'family'], [/Musik|Konzerte/i, 'music'],
  [/Märkte|Einkaufen/i, 'market'], [/Feste|Feiern/i, 'festival'],
  [/Kultur|Kunst|Ausstellung|Aufführung|Führung/i, 'culture'],
  [/Sport|Bewegung|Wandern/i, 'sport'], [/Kulinarik/i, 'food'],
  [/Bildung|Vorträge/i, 'workshop'],
];

function categories(sourceCategories) {
  return [...new Set(CATEGORY_RULES.flatMap(([pattern, category]) => (
    sourceCategories.some((value) => pattern.test(value)) ? [category] : []
  )))];
}

export function sindelfingenPageCount(html) {
  const pages = [...String(html || '').matchAll(/veranstaltungskalender\/seite-(\d+)\/suche-none/gi)]
    .map((match) => Number(match[1])).filter(Number.isFinite);
  return Math.max(1, ...pages);
}

export function parseSindelfingenEvents(html) {
  const source = String(html || '');
  const starts = [...source.matchAll(/<div class=["'][^"']*\bhw_fe__record\b[^"']*\bhwveranstaltung__record\b[^"']*["'][^>]*>/gi)]
    .map((match) => match.index);
  const listEnd = source.indexOf('<nav', starts.at(-1) || 0);
  const events = [];
  for (let index = 0; index < starts.length; index += 1) {
    const block = source.slice(starts[index], starts[index + 1] || (listEnd > 0 ? listEnd : undefined));
    const title = text(block.match(/<h3[^>]*class=["'][^"']*hw_record__title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    const dateText = text(block.match(/class=["'][^"']*hw_record__date[^"']*["'][^>]*>[\s\S]*?class=["'][^"']*hw_record__value__text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const dateMatches = [...dateText.matchAll(/\d{2}\.\d{2}\.\d{4}/g)].map((match) => isoDate(match[0]));
    const href = decode(block.match(/<a[^>]*class=["'][^"']*hw_record__more__show[^"']*["'][^>]*href=["']([^"']+)["']/i)?.[1]);
    if (!title || !dateMatches[0] || !href) continue;
    const venue = text(block.match(/class=["'][^"']*hw_record__simpleLocation[^"']*["'][^>]*>[\s\S]*?class=["'][^"']*hw_record__value__text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]) || null;
    const sourceCategories = [...block.matchAll(/class=["'][^"']*hw_record__categories[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => text(match[1])).filter(Boolean);
    const timeText = text(block.match(/class=["'][^"']*hw_record__time\b[^"']*["'][^>]*>[\s\S]*?class=["'][^"']*hw_record__value__text[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const eventTimes = times(timeText);
    events.push({
      title, description_short: null, date_start: dateMatches[0], time_start: eventTimes.start,
      date_end: dateMatches[1] || null, time_end: eventTimes.end, venue, address_text: null,
      town: 'Sindelfingen', oblast: 'Baden-Württemberg', categories: categories(sourceCategories),
      is_free: null, age_min: null, age_max: null, indoor: null, lat: null, lng: null,
      source_url: new URL(href, 'https://www.sindelfingen.de').toString(),
      source_name: 'Stadt Sindelfingen', country: 'DE',
    });
  }
  return events;
}
