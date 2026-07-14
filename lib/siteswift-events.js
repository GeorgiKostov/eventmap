// Deterministic parser for the "siteswift" CMS diocese calendar listing pages.
// Six Austrian dioceses run one platform (siteswift.com) with a central
// parish-level events calendar at each diocese's own domain — but each
// diocese skins the listing markup differently, so this is a small waterfall
// of markup variants (mirrors the GEM2GO precedent in scripts/crawl.mjs),
// tried in turn; the first with output wins. Facts only: description stays
// null (never copy their prose — the "teaser" text seen on some skins is
// dropped); no photos. Never fabricate — no parseable date/title/linkback on
// a block means that block is skipped, not guessed.
//
// IMPORTANT — the /termine (or equivalent) listing on every diocese observed
// live is a fixed-size "next ~20 upcoming events" feed (verified: exactly 20
// raw entries on every sample fetched), not a full month. For a busy diocese
// (Linz, Wien, Graz-Seckau) that's entirely today; for a quieter one
// (Eisenstadt) it spans out to several weeks ahead in the one page. Date
// navigation (prev/next month, "gotopage") goes through
// `<host>/portal/....siteswift?...` URLs, which robots.txt disallows
// site-wide (`Disallow: /*.siteswift$` / `/*.siteswift?*$`) on all six
// dioceses — so there is no robots-compliant way to page past that ~20-event
// window. Repeated crawls (crawl.mjs's normal recadence) roll the window
// forward and accumulate the recurring weekly/monthly appointments
// (MuKi-Treff, Jungscharstunde, Kinderchor, ...) over time; this is a
// deliberate single-page-per-crawl fetch, not a missed pager.

import { decodeEntities, stripTags } from './entities.js';
function absUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

// German month name (full "Juli"/"März" or abbreviated "Jul") -> "01".."12"
// via its first 3 letters — unique across all 12 names, full or abbreviated,
// so one small map covers every skin's date format.
const DE_MON3 = {
  jan: '01', feb: '02', mär: '03', mrz: '03', apr: '04', mai: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dez: '12',
};
function deMonthNum(word) {
  return DE_MON3[(word || '').toLowerCase().slice(0, 3)] || null;
}

function timeRange(text) {
  const m = (text || '').match(/(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?/);
  return { time_start: m ? m[1] : null, time_end: m && m[2] ? m[2] : null };
}

// 'family' only where the title clearly reads as kids/family programming;
// null (empty array) beats a guess for anything else — most siteswift
// entries are ordinary parish life (Mass times, office hours, funerals).
const FAMILY_RE = /kinder|jungschar|muki|famili/i;
function categorize(title) {
  return FAMILY_RE.test(title || '') ? ['family'] : [];
}

// Every diocese detail page lives at ".../kalender/calendar/<id>.html" —
// except erzdioezese-wien.at's own dialect, ".../_calendar/calendar/<id>.html".
// This URL shape is a stable CMS-wide signature, so pulling the linkback this
// way works across every skin's differently-wrapped title anchor.
const DETAIL_HREF_RE = /href="([^"]*(?:kalender|_calendar)\/calendar\/\d+\.html[^"]*)"/i;
function detailUrl(chunk, base) {
  const m = chunk.match(DETAIL_HREF_RE);
  return m ? absUrl(decodeEntities(m[1]), base) : null;
}

// "Venue (Town)" / "Venue, Town" trailing-annotation convention, OR a short
// bare-word string with no venue-ish keyword (a few skins put just the parish
// town in the place field, no venue name at all). Ambiguous "Town - Venue"
// prefixes are left as venue text untouched — never guess which side of a
// hyphen is the town.
const VENUE_WORD_RE = /pfarr|kirche|haus|zentrum|heim|café|cafe|saal|platz|schule|kindergarten|treffpunkt|kapelle|kloster|foyer|laden|halle|amt|markt|friedhof/i;
function classifyPlace(text) {
  if (!text) return { venue: null, town: null };
  const trimmed = text.trim();
  let m = trimmed.match(/^(.*\S)\s*\(([\p{Lu}][\p{L}.\- ]{1,30})\)$/u);
  if (!m) m = trimmed.match(/^(.*\S),\s*([\p{Lu}][\p{L}.\- ]{1,30})$/u);
  if (m && !/\d/.test(m[2])) return { venue: m[1].trim() || null, town: m[2].trim() };
  if (!/\d/.test(trimmed) && !VENUE_WORD_RE.test(trimmed) && trimmed.split(/\s+/).length <= 4
    && /^[\p{Lu}][\p{L}.\- ]*$/u.test(trimmed)) {
    return { venue: null, town: trimmed };
  }
  return { venue: trimmed, town: null };
}

// ---- "contentSection middleSection" family (dioezese-linz.at,
// martinus.at/Eisenstadt, katholische-kirche-steiermark.at/Graz-Seckau) —
// one flat block per event; three different day/month header shapes and two
// different time/place shapes seen live across these three dioceses. ----

function sectionDate(chunk) {
  // A (Linz): <div class="day">01.</div><div class="monthyear">07.26</div>
  let m = chunk.match(/<div class="day">(\d{1,2})\.?<\/div>\s*<div class="monthyear">(\d{2})\.(\d{2})<\/div>/);
  if (m) return `20${m[3]}-${m[2]}-${m[1].padStart(2, '0')}`;
  // D (Eisenstadt): <div class="daytime"><div class="day">14.</div></div>
  //                 <div class="month">Juli<br>2026</div>
  m = chunk.match(/<div class="day">(\d{1,2})\.?<\/div>\s*(?:<\/div>\s*)?<div class="month">\s*([A-Za-zÄÖÜäöüß]+)\.?<br\s*\/?>\s*(\d{4})\s*<\/div>/);
  if (m) { const mo = deMonthNum(m[2]); if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`; }
  // E (Graz-Seckau): <div class="day">14</div><div class="month">Juli</div><div class="year">2026</div>
  m = chunk.match(/<div class="day">(\d{1,2})\.?<\/div>\s*<div class="month">([A-Za-zÄÖÜäöüß]+)\.?<\/div>\s*<div class="year">(\d{4})<\/div>/);
  if (m) { const mo = deMonthNum(m[2]); if (mo) return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`; }
  return null;
}
function sectionTimeVenue(chunk) {
  // E: <div class="placetime"><span class="time">08:00</span><span class="place">Pfarramt X</span></div>
  let m = chunk.match(/<div class="placetime">[\s\S]*?<span class="time">([^<]*)<\/span>[\s\S]*?<span class="place">([^<]*)<\/span>/);
  if (m) return { ...timeRange(m[1]), place: stripTags(m[2]) };
  // A: <div class="timeplace">08:30 Uhr | Venue text</div>
  m = chunk.match(/<div class="timeplace">([\s\S]*?)<\/div>/);
  if (m) {
    const text = stripTags(m[1]);
    return { ...timeRange(text), place: text.replace(/^\d{2}:\d{2}\s*Uhr\s*\|\s*/, '').trim() || null };
  }
  // D: <div class="place">16:30 - 18:30&nbsp;Eisenstadt</div> (time + venue/town mashed together)
  m = chunk.match(/<div class="place">([\s\S]*?)<\/div>/);
  if (m) {
    const text = stripTags(m[1]);
    return { ...timeRange(text), place: text.replace(/^\d{2}:\d{2}(?:\s*-\s*\d{2}:\d{2})?\s*/, '').trim() || null };
  }
  return { time_start: null, time_end: null, place: null };
}
function sectionTitle(chunk) {
  const m = chunk.match(/<div class="modTitle">([\s\S]*?)<\/div>/);
  return m ? stripTags(m[1]) : null;
}
function parseSectionFamily(html, src) {
  const chunks = html.split('<div class="contentSection middleSection').slice(1);
  const events = [];
  for (const chunk of chunks) {
    const date_start = sectionDate(chunk);
    if (!date_start) continue; // never fabricate: no date -> skip
    const title = sectionTitle(chunk);
    if (!title) continue;
    const source_url = detailUrl(chunk, src.url);
    if (!source_url) continue; // hard rule 1: every event needs a linkback
    const { time_start, time_end, place } = sectionTimeVenue(chunk);
    const { venue, town } = classifyPlace(place);
    events.push({
      title, date_start, time_start, date_end: null, time_end,
      venue, address: null, town: town || src.town || null,
      categories: categorize(title), is_free: null, age_min: null, age_max: null, indoor: null,
      description: null, source_url,
    });
  }
  return events;
}

// ---- "article.item" family (erzdioezese-wien.at, edsbg.at/Salzburg) — one
// calHeader per day, followed by that day's <article class="item"> blocks. ----

function articleDayDate(headerChunk) {
  // Wien: <div class="day">14.</div><div class="month">Juli 2026</div>
  // Salzburg: <div class="weekday">Di</div><div class="day">14</div><div class="month">Jul&#039; 26</div>
  const m = decodeEntities(headerChunk).match(/<div class="day">(\d{1,2})\.?<\/div>\s*<div class="month">\s*([A-Za-zÄÖÜäöüß]+)[.’']*\s*(\d{2,4})/);
  if (!m) return null;
  const mo = deMonthNum(m[2]);
  if (!mo) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${mo}-${m[1].padStart(2, '0')}`;
}
function articleTitle(chunk) {
  let m = chunk.match(/<h3 class="title">([\s\S]*?)<\/h3>/);
  if (m) return stripTags(m[1]);
  m = chunk.match(/<h2>([\s\S]*?)<\/h2>/);
  return m ? stripTags(m[1]) : null;
}
function articleVenueTown(chunk, srcTown) {
  // Wien gives an explicit "PLZ Ort" field — trust it over the venue-word
  // heuristic used elsewhere, same convention as lib/kinderfreunde-events.js.
  const location = chunk.match(/<div class="location">([^<]*)<\/div>/);
  const plz = chunk.match(/<div class="plzOrt">([^<]*)<\/div>/);
  if (location || plz) {
    let town = null;
    if (plz) { const pm = stripTags(plz[1]).match(/^\d{4,5}\s+(.+)$/); town = pm ? pm[1].trim() : null; }
    return { venue: location ? stripTags(location[1]) || null : null, town: town || srcTown || null };
  }
  // Salzburg: either a "place" (venue) or a "subtitle" (no clean venue given).
  const place = chunk.match(/<div class="place">([^<]*)<\/div>/);
  if (place) { const c = classifyPlace(stripTags(place[1])); return { venue: c.venue, town: c.town || srcTown || null }; }
  const subtitle = chunk.match(/<div class="subtitle">([^<]*)<\/div>/);
  if (subtitle) { const c = classifyPlace(stripTags(subtitle[1])); return { venue: c.venue, town: c.town || srcTown || null }; }
  return { venue: null, town: srcTown || null };
}
function parseArticleFamily(html, src) {
  const daySections = html.split('<div class="calHeader">').slice(1);
  const events = [];
  for (const section of daySections) {
    const date_start = articleDayDate(section);
    if (!date_start) continue; // never fabricate: no parseable day header -> skip section
    const articles = section.split('<article class="item">').slice(1);
    for (const chunk of articles) {
      const title = articleTitle(chunk);
      if (!title) continue;
      const source_url = detailUrl(chunk, src.url);
      if (!source_url) continue; // hard rule 1
      const timeMatch = chunk.match(/<div class="time">([\s\S]*?)<\/div>/);
      const { time_start, time_end } = timeRange(timeMatch ? stripTags(timeMatch[1]) : '');
      const { venue, town } = articleVenueTown(chunk, src.town);
      const addrMatch = chunk.match(/<div class="adresse">([^<]*)<\/div>/);
      events.push({
        title, date_start, time_start, date_end: null, time_end,
        venue, address: addrMatch ? stripTags(addrMatch[1]) || null : null, town,
        categories: categorize(title), is_free: null, age_min: null, age_max: null, indoor: null,
        description: null, source_url,
      });
    }
  }
  return events;
}

export function parseSiteswiftEvents(html, src) {
  const articles = parseArticleFamily(html, src);
  if (articles.length) return articles;
  return parseSectionFamily(html, src);
}
