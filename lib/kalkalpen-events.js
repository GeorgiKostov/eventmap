// Two-hop sitemap-based parser for Nationalpark Kalkalpen's guided-tour pages.
// kalkalpen.at/veranstaltungskalender itself is a JS-only Contao calendar
// widget, but every tour's own detail page (kalkalpen.at/veranstaltung/<slug>)
// is server-rendered and listed in the site's sitemap.xml — so the crawl
// fetches the sitemap, filters to /veranstaltung/ locs, then politeFetch's
// each detail page. Facts only: description stays null (never copy their
// prose); no photos. Never fabricate — a page with no bookable date ("Aktuell
// ist kein Termin verfügbar") or no parseable date at all is skipped
// entirely, not guessed.
//
// Live shape observed (2026-07-14, 6 detail pages sampled): every dated page
// uses a "Termin buchen" list of <li class="status-buchbar"|"status-warteliste">
// entries — one per bookable occurrence, each with its own date, time range,
// and town (via a map-marker "termine-zusatz" span, occasionally suffixed
// ", Warteliste"). No page sampled used bare prose ("findet am ... statt");
// a prose fallback is kept anyway in case another of the ~71 pages does.

function decodeEntities(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&ouml;/g, 'ö').replace(/&auml;/g, 'ä').replace(/&uuml;/g, 'ü')
    .replace(/&Ouml;/g, 'Ö').replace(/&Auml;/g, 'Ä').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&ndash;/g, '–').replace(/&#40;/g, '(').replace(/&#41;/g, ')');
}
function stripTags(s) {
  return decodeEntities((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// sitemap.xml -> absolute detail-page URLs, filtered to /veranstaltung/<slug>
// (excludes the JS-only /veranstaltungskalender listing page itself, which
// the sitemap also lists but which has no server-rendered event data).
export function kalkalpenDetailUrls(sitemapXml) {
  const locs = [...String(sitemapXml || '').matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decodeEntities(m[1].trim()));
  return locs.filter((u) => /\/veranstaltung\/[^/?#]+$/.test(u));
}

// 'family' only where the title clearly reads as kids/family programming —
// most tours are general-audience hikes; null (empty array) beats a guess.
const FAMILY_RE = /kinder|familie/i;
function categorize(title) {
  return FAMILY_RE.test(title || '') ? ['family'] : [];
}

function pageTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  if (!m) return null;
  return stripTags(m[1]).replace(/\s*-\s*kalkalpen\.at\s*$/i, '').trim() || null;
}

// "Termin buchen" section: one <li class="status-buchbar"|"status-warteliste">
// per bookable occurrence — date + time range in the link text, town in the
// trailing "termine-zusatz" marker span (occasionally ", Warteliste" suffixed,
// which is a booking-status note, not part of the town name — stripped).
function parseBookableDates(html) {
  const items = [...html.matchAll(/<li class="status-[a-z-]+">([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  const out = [];
  for (const item of items) {
    const dm = item.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dm) continue; // never fabricate: no date -> skip this occurrence
    const date_start = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const tm = item.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
    const zusatzMatch = item.match(/<span class="termine-zusatz">([\s\S]*?)<\/span>/i);
    const town = zusatzMatch
      ? stripTags(zusatzMatch[1]).replace(/,?\s*Warteliste\s*$/i, '').trim() || null
      : null;
    out.push({ date_start, date_end: null, time_start: tm ? tm[1] : null, time_end: tm ? tm[2] : null, town });
  }
  return out;
}

const DE_MONTHS = {
  januar: '01', februar: '02', märz: '03', april: '04', mai: '05', juni: '06',
  juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
};

// Fallback for pages that state a date in prose instead of a "Termin buchen"
// list — not observed live in this sweep, kept defensively. "findet am D.
// Month YYYY statt" (single date) or "vom D. Month [YYYY] bis D. Month YYYY"
// (range; the first year is sometimes omitted when both dates share a year).
function proseDateOccurrence(bodyText) {
  let m = bodyText.match(/findet am (\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(\d{4})\s*statt/i);
  if (m) {
    const mo = DE_MONTHS[m[2].toLowerCase()];
    if (mo) return { date_start: `${m[3]}-${mo}-${m[1].padStart(2, '0')}`, date_end: null };
  }
  m = bodyText.match(/vom (\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(\d{4})?\s*bis\s*(?:zum\s*)?(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(\d{4})/i);
  if (m) {
    const mo1 = DE_MONTHS[m[2].toLowerCase()];
    const mo2 = DE_MONTHS[m[5].toLowerCase()];
    const year2 = m[6];
    const year1 = m[3] || year2;
    if (mo1 && mo2) {
      return {
        date_start: `${year1}-${mo1}-${m[1].padStart(2, '0')}`,
        date_end: `${year2}-${mo2}-${m[4].padStart(2, '0')}`,
      };
    }
  }
  return null;
}
function proseTime(bodyText) {
  let m = bodyText.match(/um (\d{2}):(\d{2})\s*Uhr/i);
  if (m) return `${m[1]}:${m[2]}`;
  m = bodyText.match(/(\d{2})\.(\d{2})\s*Uhr/);
  return m ? `${m[1]}:${m[2]}` : null;
}
function proseVenue(bodyText) {
  const m = bodyText.match(/Treffpunkt:\s*([^.\n]{2,80})/i);
  return m ? m[1].trim().replace(/\s{2,}/g, ' ') : null;
}

// html -> zero or more occurrence event objects for this one detail page (one
// row per bookable date; a page can have many upcoming occurrences of the
// same tour). Never fabricate: [] when no parseable date exists anywhere.
export function parseKalkalpenDetail(html, url) {
  if (/kein Termin verfügbar/i.test(html)) return [];
  const title = pageTitle(html);
  if (!title) return [];

  const bookable = parseBookableDates(html);
  const cats = categorize(title);
  if (bookable.length) {
    return bookable.map((occ) => ({
      title, date_start: occ.date_start, time_start: occ.time_start,
      date_end: occ.date_end, time_end: occ.time_end,
      venue: null, address: null, town: occ.town,
      categories: cats, is_free: null, age_min: null, age_max: null, indoor: null,
      description: null, source_url: url,
    }));
  }

  const bodyText = stripTags(html);
  const occ = proseDateOccurrence(bodyText);
  if (!occ) return []; // never fabricate: no parseable date -> skip
  return [{
    title, date_start: occ.date_start, time_start: proseTime(bodyText),
    date_end: occ.date_end, time_end: null,
    venue: proseVenue(bodyText), address: null, town: null,
    categories: cats, is_free: null, age_min: null, age_max: null, indoor: null,
    description: null, source_url: url,
  }];
}
