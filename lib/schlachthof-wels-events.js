// Deterministic adapter for the official Alter Schlachthof Wels TYPO3 programme.

import { decodeEntities, stripTags } from './entities.js';

export const SCHLACHTHOF_WELS_SOURCE_URL = 'https://www.schlachthofwels.at/programm/';

const MONTHS = {
  jan: '01', januar: '01', jänner: '01', feb: '02', februar: '02', mär: '03', märz: '03',
  apr: '04', april: '04', mai: '05', jun: '06', juni: '06', jul: '07', juli: '07',
  aug: '08', august: '08', sep: '09', sept: '09', september: '09', okt: '10', oktober: '10',
  nov: '11', november: '11', dez: '12', dezember: '12',
};

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim() || null;
}

function absoluteUrl(href, base) {
  try { return href ? new URL(decodeEntities(href), base).toString() : null; } catch { return null; }
}

function categoriesFor(value) {
  const source = String(value || '').toLowerCase();
  const categories = [];
  if (/konzert|musik|rock|pop|jazz|blues|soul|band|dj|singer/.test(source)) categories.push('music');
  if (/festival|open air|sommerfest/.test(source)) categories.push('festival');
  if (/kind|jugend|famil/.test(source)) categories.push('family');
  if (/theater|literatur|lesung|film|ausstellung|party|divers/.test(source)) categories.push('culture');
  if (/workshop|kurs|seminar/.test(source)) categories.push('workshop');
  return [...new Set(categories)];
}

export function parseSchlachthofWelsPage(html, src = {}) {
  const baseUrl = src.url || SCHLACHTHOF_WELS_SOURCE_URL;
  const starts = [...String(html || '').matchAll(/<div\b[^>]*class=["']row\s+eventitem[^"']*["'][^>]*>/gi)];
  const events = [];
  for (let i = 0; i < starts.length; i++) {
    const card = html.slice(starts[i].index, starts[i + 1]?.index || html.length);
    const link = card.match(/href=["']([^"']*\/programm\/detail\/[^"']+)["']/i);
    const title = text(card.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
    const day = text(card.match(/class=["'][^"']*\bevent-date-day\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const month = text(card.match(/class=["'][^"']*\bevent-date-month\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const year = text(card.match(/class=["'][^"']*\bevent-date-year\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const time = text(card.match(/class=["'][^"']*\bevent-date-time\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const dateMonth = MONTHS[String(month || '').toLowerCase()];
    if (!link || !title || !day || !dateMonth || !/^20\d{2}$/.test(year || '')) continue;
    const genres = [...card.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => text(m[1])).filter(Boolean);
    events.push({
      title,
      date_start: `${year}-${dateMonth}-${day.padStart(2, '0')}`,
      time_start: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? time : null,
      date_end: null,
      time_end: null,
      venue: 'Alter Schlachthof Wels',
      address: null,
      town: src.town || 'Wels',
      categories: categoriesFor(`${title} ${genres.join(' ')}`),
      is_free: null,
      age_min: null,
      age_max: null,
      indoor: null,
      description: null,
      source_url: absoluteUrl(link[1], baseUrl),
    });
  }
  return events;
}
