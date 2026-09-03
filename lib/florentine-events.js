// Deterministic parser for Fräulein Florentine's official rendered Google
// Calendar blocks. Facts come from the visible date/title; source prose and
// images are intentionally ignored.

import { decodeEntities, stripTags } from './entities.js';

export const FLORENTINE_SOURCE_URL = 'https://frl-florentine.at/eventkalender-schiff/';

const MONTHS = {
  januar: 1, februar: 2, 'märz': 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim() || null;
}

function addDay(date) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function categoriesFor(value) {
  const source = String(value || '').toLowerCase();
  const categories = [];
  if (/konzert|musik|swing|dj|tanzen|open mic|livecoding/.test(source)) categories.push('music');
  if (/flohmarkt|markt/.test(source)) categories.push('market');
  if (/kind|famil/.test(source)) categories.push('family');
  if (/workshop|kurs|stammtisch|strick/.test(source)) categories.push('workshop');
  if (/lesung|theater|impro|kultur/.test(source)) categories.push('culture');
  return [...new Set(categories)];
}

function dateFromGerman(value) {
  const match = String(value || '').toLowerCase().match(/(\d{1,2})\.\s*([a-zä]+)\s+(\d{4})/i);
  const month = MONTHS[match?.[2]];
  return match && month ? `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}` : null;
}

function titleAndTime(value) {
  const original = text(value);
  if (!original) return { title: null, time_start: null, time_end: null };
  const range = original.match(/\b((?:[01]?\d|2[0-3]):[0-5]\d)\s*(?:bis|-|–)\s*((?:[01]?\d|2[0-3]):[0-5]\d)(?:\s*Uhr)?\s*$/i);
  const single = range ? null : original.match(/\b((?:[01]?\d|2[0-3]):[0-5]\d)(?:\s*Uhr)?\s*$/i);
  const start = range?.[1] || single?.[1] || null;
  const end = range?.[2] || null;
  const suffix = range?.[0] || single?.[0] || '';
  const title = original.slice(0, original.length - suffix.length).replace(/[|\s–-]+$/, '').trim() || original;
  const normalize = (time) => time ? `${time.split(':')[0].padStart(2, '0')}:${time.split(':')[1]}` : null;
  return { title, time_start: normalize(start), time_end: normalize(end) };
}

export function parseFlorentineEvents(html, src = {}) {
  const sourceUrl = src.url || FLORENTINE_SOURCE_URL;
  const starts = [...String(html || '').matchAll(
    /<div\b[^>]*class=["'][^"']*\bgcal-day-block\b[^"']*["'][^>]*>/gi,
  )];
  const events = [];
  for (let i = 0; i < starts.length; i++) {
    const block = html.slice(starts[i].index, starts[i + 1]?.index || html.length);
    const dateText = text(block.match(
      /class=["'][^"']*\bgcal-event-date\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    )?.[1]);
    const date_start = dateFromGerman(dateText);
    if (!date_start) continue;
    const titles = [...block.matchAll(
      /<h3\b[^>]*class=["'][^"']*\bgcal-event-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/gi,
    )];
    for (const titleMatch of titles) {
      const parsed = titleAndTime(titleMatch[1]);
      if (!parsed.title) continue;
      const overnight = parsed.time_start && parsed.time_end && parsed.time_end <= parsed.time_start;
      events.push({
        title: parsed.title,
        date_start,
        time_start: parsed.time_start,
        date_end: overnight ? addDay(date_start) : null,
        time_end: parsed.time_end,
        venue: 'Salonschiff Fräulein Florentine',
        address: null,
        town: src.town || 'Linz',
        categories: categoriesFor(parsed.title),
        is_free: null,
        age_min: null,
        age_max: null,
        indoor: null,
        description: null,
        source_url: sourceUrl,
      });
    }
  }
  return events;
}
