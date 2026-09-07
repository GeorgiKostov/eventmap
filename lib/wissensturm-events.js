// Facts from the municipal library's visible calendar cards, without source prose.
import { decodeEntities, stripTags } from './entities.js';

export const WISSENSTURM_SOURCE_URL = 'https://wissensturm.linz.at/bibliothek/veranstaltungen.php';

function text(value) {
  return stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim();
}

function date(value) {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseWissensturmEvents(html, src = {}) {
  const events = [];
  const freeProgramme = /kostenloses Veranstaltungsprogramm/.test(text(html));
  for (const match of String(html || '').matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const block = match[1];
    const title = text(block.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]);
    const visible = text(block);
    const dates = visible.match(/Termin:\s*(\d{2}\.\d{2}\.\d{4})(?:\s+bis\s+(\d{2}\.\d{2}\.\d{4}))?/);
    const date_start = date(dates?.[1]);
    const date_end = date(dates?.[2]);
    const venue = text(block.match(/Veranstaltungsort:\s*<\/span>\s*<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1]) || null;
    const href = decodeEntities(block.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] || '');
    if (!title || !date_start || !href || (dates?.[2] && (!date_end || date_end < date_start))) continue;
    const link = new URL(href, src.url || WISSENSTURM_SOURCE_URL);
    if (!['wissensturm.linz.at', 'vhskurs.linz.at'].includes(link.hostname)) continue;
    const time_start = visible.match(/Uhrzeit\s*:\s*((?:[01]?\d|2[0-3]):[0-5]\d)\s*Uhr/)?.[1]?.padStart(5, '0') || null;
    const age = visible.match(/(?:Kinder\s+)?ab\s+(\d+)\s+Jahren/i);
    const family = /\bKinder\b|Vorlesestunde|Bilderbuch|Büchermäuse/.test(visible);
    const categories = /Flohmarkt/.test(title) ? ['market'] : ['culture'];
    if (family) categories.push('family');
    if (/Workshop|Reparieren/.test(visible)) categories.push('workshop');
    events.push({
      title, date_start, time_start, date_end, time_end: null,
      venue,
      address: venue && /Wissensturm/.test(venue) && !/ und /.test(venue) ? 'Kärntnerstraße 26, 4020 Linz' : null,
      town: src.town || 'Linz', categories,
      is_free: freeProgramme || /Teilnahme kostenlos|Eintritt frei/i.test(visible) ? true : null,
      age_min: age ? Number(age[1]) : null, age_max: null, indoor: null,
      description: null, source_url: link.toString(),
    });
  }
  return events;
}
