// Parsers for the Pflasterspektakel Linz programme: the daily grid of who plays
// where, plus the two fixed programme pages (Kaleidoskop and Feuershows).
//
// Why this source needs its own adapter, and why it is shaped like this:
//
// The festival publishes NO schedule in advance, and that is deliberate: "Die
// Künstler*innen wählen ihre Auftrittszeiten und -orte während des Festivals
// täglich neu." The grid is written fresh every day and goes up "kurz vor
// Programmstart" (DO 16:00, FR & SA 14:00). Outside those three days the page
// reads "Aktuell ist noch kein Tagesprogramm verfügbar", and the festival's own
// archive keeps the ARTISTS but never the grid — so this is a
// capture-it-live-or-lose-it source. Last year's schedule survives only because
// the Wayback Machine happened to catch one day of it.
//
// The grid is clean server-rendered HTML: one <h2> area heading (Hauptplatz,
// Pfarrplatz, Landstraße, Altstadt, Promenade, Spektakel-Oasen) per <table>,
// rows = one Spielort (Kürzel "H1" + name "Dreifaltigkeitssäule"), columns =
// nine one-hour slots (14-15h … 22-23h), cells = artist + genre + a link to the
// artist's id. Deterministic, no LLM, no cost. (Their WordPress even exposes
// /wp/v2/auftritte + /wp/v2/auftrittsort — exactly this data — but the REST API
// 401s behind a security plugin, so we parse the public page instead.)
//
// THE DATE TRAP, and the only reason this adapter is safe:
// the page carries no date and no day switcher. It is ONE grid, overwritten
// daily. So "which day is this?" cannot be read off the grid, and stamping it
// with "whenever the crawl happened to run" would silently mislabel an entire
// day's line-up — our nightly cron fires ~06:00 Vienna, hours before the day's
// grid is up, so it would read yesterday's and call it today's. Instead the day
// comes from the source's own Yoast `article:modified_time`, and we refuse to
// emit anything unless that lands on the same Vienna day as the crawl. A grid we
// cannot date is a grid we do not store (hard rule 5).
//
// One event per Spielort per day (~35), not one per act (~275): a pin per stage
// is what someone standing on the Hauptplatz actually wants, and 800 hour-slot
// rows would bury the rest of Linz on the weekend the coverage test runs.

import { decodeEntities, stripTags } from './entities.js';

export const PFLASTER_HOME_URL = 'https://pflasterspektakel.at/de/';
const KALEIDOSKOP_PATH = '/programm/kaleidoskopshows/';
const FIRE_PATH = '/programm/feuershows/';

export function isPflasterFixedSourceUrl(url) {
  try {
    const path = new URL(url).pathname;
    return path.endsWith(KALEIDOSKOP_PATH) || path.endsWith(FIRE_PATH);
  } catch {
    return false;
  }
}

// Hard rule 3: every "what day is it" question is Vienna wall-clock, never the
// host's. 'en-CA' is the shortest route to a YYYY-MM-DD string.
const VIENNA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit',
});
export const viennaDay = (d) => VIENNA_DAY.format(d);

const clean = (s) => decodeEntities(stripTags(s || '')).replace(/\s+/g, ' ').trim();

const DE_MONTHS = {
  januar: 1, februar: 2, märz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

// The fixed programme pages say "täglich" but carry no dates. The site's own
// homepage is therefore fetched alongside them and included in the source hash;
// its #datum field is the authoritative annual range (currently 23.–25.7.2026).
export function pflasterFestivalDates(html) {
  const datum = html.match(/<div\b[^>]*id=["']datum["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!datum) return [];
  const text = clean(datum[1]);
  const m = text.match(/(\d{1,2})\.\s*(?:-|–|—|bis)\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/i);
  if (!m) return [];
  const startDay = Number(m[1]);
  const endDay = Number(m[2]);
  const month = DE_MONTHS[m[3].toLowerCase()];
  const year = Number(m[4]);
  if (!month || startDay < 1 || endDay < startDay || endDay > 31) return [];
  const start = isoDate(year, month, startDay);
  return Array.from({ length: endDay - startDay + 1 }, (_, i) => addDays(start, i));
}

function fixedEvent({ title, date, timeStart, timeEnd, endNextDay = false, venue,
  categories, isFree, indoor, description, src }) {
  return {
    title,
    date_start: date,
    time_start: timeStart,
    date_end: endNextDay ? addDays(date, 1) : date,
    time_end: timeEnd,
    venue,
    address: null,
    town: src?.town || 'Linz',
    categories,
    is_free: isFree,
    age_min: null,
    age_max: null,
    indoor,
    description,
    source_url: src?.url,
  };
}

export function parsePflasterFixedEvents(html, src) {
  const dates = pflasterFestivalDates(html);
  if (!dates.length) return [];
  const text = clean(html);
  let path;
  try { path = new URL(src?.url || '').pathname; } catch { return []; }

  if (path.endsWith(FIRE_PATH)) {
    if (!/20\s*[–—-]\s*23 Uhr/i.test(text)
      || !/Hauptplatz und am Pfarrplatz/i.test(text)) return [];
    return dates.flatMap((date) => ['Hauptplatz', 'Pfarrplatz'].map((venue) => fixedEvent({
      title: `Pflasterspektakel Feuershows: ${venue}`,
      date,
      timeStart: '20:00',
      timeEnd: '23:00',
      venue,
      categories: ['festival', 'culture'],
      // Artists play for Hutgeld; the source does not call the shows free.
      isFree: null,
      indoor: false,
      description: `Feuer-, Pyrotechnik- und LED-Shows beim Pflasterspektakel am ${venue}.`,
      src,
    })));
  }

  if (path.endsWith(KALEIDOSKOP_PATH)) {
    if (!/Kaleidoskopnachmittage, täglich um 17[.:]00 Uhr/i.test(text)
      || !/Kaleidoskopnächte, täglich um 20[.:]00\s*&\s*22[.:]30 Uhr/i.test(text)
      || !/einstündigen Programm/i.test(text)
      || !/90minütigen Revueshow/i.test(text)
      || !/Gratis-Sitzplatzkarten/i.test(text)) return [];
    return dates.flatMap((date) => [
      fixedEvent({
        title: 'Pflasterspektakel: Kaleidoskopnachmittag',
        date, timeStart: '17:00', timeEnd: '18:00', venue: 'LINZ AG Spektakelzelt',
        categories: ['festival', 'culture', 'family'], isFree: true, indoor: null,
        description: 'Kinder-Revue beim Pflasterspektakel mit wechselnden Ausschnitten aus dem Straßenkunstprogramm; kostenlose Sitzplatzkarte erforderlich.',
        src,
      }),
      fixedEvent({
        title: 'Pflasterspektakel: Kaleidoskopnacht (20 Uhr)',
        date, timeStart: '20:00', timeEnd: '21:30', venue: 'LINZ AG Spektakelzelt',
        categories: ['festival', 'culture'], isFree: true, indoor: null,
        description: 'Abendliche Straßenkunst-Revue beim Pflasterspektakel; kostenlose Sitzplatzkarte erforderlich.',
        src,
      }),
      fixedEvent({
        title: 'Pflasterspektakel: Kaleidoskopnacht (22:30 Uhr)',
        date, timeStart: '22:30', timeEnd: '00:00', endNextDay: true,
        venue: 'LINZ AG Spektakelzelt', categories: ['festival', 'culture'],
        isFree: true, indoor: null,
        description: 'Späte Straßenkunst-Revue beim Pflasterspektakel; kostenlose Sitzplatzkarte erforderlich.',
        src,
      }),
    ]);
  }

  return [];
}

// The day the grid on the page belongs to, per the source itself. Yoast stamps
// article:modified_time (and the same value into its JSON-LD dateModified) every
// time the page is edited, which is what publishing a day's grid does.
export function gridModifiedAt(html) {
  const m = (html || '').match(/<meta[^>]+property=["']article:modified_time["'][^>]+content=["']([^"']+)["']/i)
    || (html || '').match(/"dateModified"\s*:\s*"([^"\\]+)"/i);
  if (!m) return null;
  const d = new Date(m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "14-15h" → { start: '14:00', end: '15:00' }. Anything else → null, so an
// unexpected header column simply carries no acts rather than inventing hours.
export function parseSlot(label) {
  const m = String(label || '').match(/^\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*h\s*$/i);
  if (!m) return null;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (!(a >= 0 && a <= 23) || !(b >= 1 && b <= 24)) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return { start: `${pad(a)}:00`, end: b === 24 ? '23:59' : `${pad(b)}:00` };
}

// Cells, tolerating the omitted </td>/</th> tags the page actually ships.
function rowCells(rowHtml) {
  return rowHtml
    .split(/<t[hd]\b[^>]*>/i)
    .slice(1)
    .map((c) => c.replace(/<\/t[hd]\s*>[\s\S]*$/i, '').replace(/<\/tr\s*>[\s\S]*$/i, ''));
}

// A cell is `<a href="…?artist=2724">Agnė Muralytė</a><br><span>(Comedy, Tanz)</span>`.
function parseAct(cellHtml) {
  const link = cellHtml.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  const artist = clean(link ? link[2] : cellHtml.split(/<br\s*\/?>/i)[0]);
  if (!artist) return null;
  const span = cellHtml.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
  const genre = clean(span ? span[1] : '').replace(/^\(|\)$/g, '').trim() || null;
  const artistId = link ? (link[1].match(/[?&]artist=(\d+)/)?.[1] ?? null) : null;
  return { artist, genre, artistId };
}

// Genre → our category vocabulary (lib/icons.js EVENT_CATS). `festival` leads so
// the pin reads as a festival; `culture` covers street performance in general.
// Nothing here invents a `family` tag — see the source registration note.
function categoriesFrom(acts) {
  const cats = ['festival', 'culture'];
  if (acts.some((a) => /musik|samba|drum/i.test(a.genre || ''))) cats.push('music');
  if (acts.some((a) => /tanz/i.test(a.genre || ''))) cats.push('party');
  return cats;
}

// Our own sentence, their facts (hard rule 1: never copy source prose).
function describe(area, location, acts) {
  const lineup = acts
    .map((a) => `${a.time_start} ${a.artist}${a.genre ? ` (${a.genre})` : ''}`)
    .join(' · ');
  return `Straßenkunst beim Pflasterspektakel am Spielort „${location}“ (${area}). `
    + `${acts.length} ${acts.length === 1 ? 'Auftritt' : 'Auftritte'}: ${lineup}.`;
}

/**
 * @param {string} html  the Tagesprogramm page
 * @param {object} src   the source row (url is used as the linkback)
 * @param {{ now?: Date }} opts  `now` is injectable so tests don't depend on the clock
 * @returns {Array} one event per Spielort, or [] when the grid is absent/undateable
 */
export function parsePflasterEvents(html, src, { now = new Date() } = {}) {
  if (isPflasterFixedSourceUrl(src?.url)) return parsePflasterFixedEvents(html, src);
  const modified = gridModifiedAt(html);
  if (!modified) return [];
  const gridDate = viennaDay(modified);
  // The guard that makes the whole adapter honest: only a grid the source itself
  // stamped TODAY may be dated today. A leftover grid (nightly cron at 06:00,
  // before the day's programme is up) fails this and yields nothing, which is
  // the correct answer — not yesterday's line-up wearing today's date.
  if (gridDate !== viennaDay(now)) return [];

  const events = [];
  for (const block of html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/gi)) {
    const area = clean(block[1]);
    const table = block[2].match(/<table\b[\s\S]*?<\/table>/i);
    if (!area || !table) continue;

    const head = table[0].match(/<thead\b[\s\S]*?<\/thead>/i);
    // No <thead> means no hour columns, and inventing them is not an option — but
    // <tbody> is optional in HTML, so fall back to "the table minus its head"
    // rather than lose a day we can never re-fetch.
    if (!head) continue;
    const tbody = table[0].match(/<tbody\b([\s\S]*?)<\/tbody>/i);
    const body = tbody ? tbody[1] : table[0].replace(head[0], '');

    // Header: [Kürzel, Location, 14-15h, …]. Slots are positional from column 2 on.
    const slots = rowCells(head[0]).slice(2).map((c) => parseSlot(clean(c)));
    if (!slots.some(Boolean)) continue;

    for (const row of body.split(/<tr\b[^>]*>/i).slice(1)) {
      const cells = rowCells(row);
      if (cells.length < 3) continue;
      const kuerzel = clean(cells[0]);
      const location = clean(cells[1]);
      if (!location) continue;

      const acts = [];
      cells.slice(2).forEach((cell, i) => {
        const slot = slots[i];
        if (!slot) return;
        const act = parseAct(cell);
        if (act) acts.push({ ...act, time_start: slot.start, time_end: slot.end });
      });
      if (!acts.length) continue;

      // A Spielort's day runs from its first act to its last. Gaps are real
      // (some stages don't play every hour) and the line-up in the description
      // carries the exact slots, so the span never claims more than it knows.
      events.push({
        // The Kürzel ("H1", "P3") is the festival's own label for the stage and
        // the one printed on its Festivalplan, so this title is what someone
        // holding the paper plan is actually looking for. It also keeps every
        // stage's title distinct, which is load-bearing: all 35 run on the same
        // day within ~300m of each other, so lib/dedup.js's sameLocation passes
        // for EVERY pair and the title is the only thing standing between two
        // stages and an automatic merge. Without it, titlesMatch()'s substring
        // rule reads "Landhaus" (Altstadt) as the same event as "Landhaus
        // Arkadenhof" (Spektakel-Oasen) whenever their start times coincide —
        // verified against the real 2025 grid — and titleSubstitution() does not
        // catch it, because that guard only fires on SWAPPED words, not added ones.
        title: kuerzel ? `Pflasterspektakel ${kuerzel}: ${location}` : `Pflasterspektakel: ${location}`,
        date_start: gridDate,
        time_start: acts[0].time_start,
        date_end: gridDate,
        time_end: acts[acts.length - 1].time_end,
        // Qualified on purpose. This string is BOTH the user-facing venue and the
        // key into the venues registry, and half these names are generic sub-spots
        // ("Brunnen", "Haltestelle", "Bank Austria"). Seeding a bare "Brunnen" for
        // Linz would hand the festival's fountain coordinates to every other Linz
        // event that ever names a Brunnen — the registry-poisoning lesson
        // (tasks/lessons.md, 2026-07-14) waiting to happen.
        venue: `${location}, ${area}`,
        address: null,
        town: src?.town || 'Linz',
        categories: categoriesFrom(acts),
        // Street acts are paid by hat ("Ohne Göd ka Musi!"), and the Kaleidoskop
        // shows need a free-but-limited seat card. The page states neither for the
        // stages, so we say nothing rather than guess (hard rule 5).
        is_free: null,
        age_min: null, age_max: null, indoor: null,
        description: describe(area, location, acts),
        source_url: src?.url || 'https://pflasterspektakel.at/de/programm/tagesprogramm/',
      });
    }
  }
  return events;
}
