// Deterministic parser for DVV Zusatzmodule municipal event RSS feeds. The
// feed's CDATA carries hCalendar fields, so no prose or LLM extraction is
// needed: title/date/place/link only, and description stays null.

import { decodeEntities as decode, stripTags as strip } from './entities.js';

// RSS wraps its payload in CDATA; unwrap that, then hand off to the ONE entity
// decoder (lib/entities.js). The local list this replaces knew nothing about
// numeric references, so `&#8211;` sailed through into stored titles.
const uncdata = (s) => String(s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '');
const decodeEntities = (s) => decode(uncdata(s));
const stripTags = (s) => strip(uncdata(s));

function tagValue(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : null;
}

function classValue(block, className) {
  const m = block.match(new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return m ? stripTags(m[1]) : null;
}

function titledDate(block, className) {
  const m = block.match(new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*\\btitle=["'](\\d{4}-\\d{2}-\\d{2})["']`, 'i'));
  return m ? m[1] : null;
}

function normalizeTime(hour, minute) {
  if (hour == null) return null;
  const h = Number(hour);
  const m = Number(minute || 0);
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timesFrom(block) {
  // DVV emits both "16:30 bis 20 Uhr" and "9 Uhr 30 bis 11 Uhr 30".
  // Normalize the word form first so a minute token can never be mistaken for
  // a second hour (the old parser turned "9 Uhr 30" into 09:00–30:00).
  const value = (classValue(block, 'uhr') || '')
    .replace(/\b(\d{1,2})\s*Uhr(?:\s*(\d{2}))?/gi, (_, hour, minute) => `${hour}:${minute || '00'}`);
  const matches = [...value.matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)];
  return {
    time_start: matches[0] ? normalizeTime(matches[0][1], matches[0][2]) : null,
    time_end: matches[1] ? normalizeTime(matches[1][1], matches[1][2]) : null,
  };
}

const CATEGORY_RULES = [
  [/Fest\b|Brauchtum/i, 'festival'], [/Konzert|Musik/i, 'music'],
  [/Markt|Flohmarkt/i, 'market'], [/Kinder|Familie|Spielmobil/i, 'family'],
  [/Ausstellung|Theater|Museum/i, 'culture'], [/\bLauf\b|Turnier|\bSport/i, 'sport'],
  [/Workshop|\bKurs\b|Seminar/i, 'workshop'], [/Kulinarik|Kulinarisch/i, 'food'],
];

function categoriesFrom(title) {
  for (const [re, category] of CATEGORY_RULES) if (re.test(title)) return [category];
  return [];
}

function eventTitle(item) {
  const raw = stripTags(tagValue(item, 'title'));
  // DVV prepends the printed date/date range to RSS titles. Remove only that
  // exact, deterministic prefix; never rewrite the event name itself.
  return raw.replace(/^\d{2}\.\d{2}\.\d{4}(?:\s*-\s*\d{2}\.\d{2}\.\d{4})?\s+/, '').trim();
}

export function parseDvvEvents(xml, src) {
  if (!/<generator>\s*dvv-Zusatzmodule\b/i.test(xml || '')) return [];
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const events = [];
  for (const item of items) {
    const title = eventTitle(item);
    const date_start = titledDate(item, 'dtstart');
    const source_url = tagValue(item, 'link');
    // Hard rule 1: every event must carry a linkback. A feed item without a
    // <link> is unusable — skip it rather than store a source-less row.
    if (!title || !date_start || !source_url) continue;
    const date_end = titledDate(item, 'dtend');
    const { time_start, time_end } = timesFrom(item);
    const venue = classValue(item, 'organization')
      || (item.match(/<div class=["']data["']>\s*([^<]+)/i)?.[1] || '').trim()
      || null;
    const street = classValue(item, 'street-address');
    const postcode = classValue(item, 'postal-code');
    const locality = classValue(item, 'locality');
    const address = [street, [postcode, locality].filter(Boolean).join(' ') || null]
      .filter(Boolean).join(', ') || null;

    events.push({
      title, date_start, time_start, date_end, time_end,
      venue, address, town: locality || src.town || null,
      categories: categoriesFrom(title),
      is_free: /kostenlos|gratis|eintritt frei/i.test(item) ? true : null,
      age_min: null, age_max: null, indoor: null,
      description: null,
      source_url,
    });
  }
  return events;
}
