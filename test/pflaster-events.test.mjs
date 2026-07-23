import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePflasterEvents, parseSlot, gridModifiedAt, viennaDay, pflasterFestivalDates,
} from '../lib/pflaster-events.js';
import { findDuplicate } from '../lib/dedup.js';

// Mirrors the real Tagesprogramm markup, including the two quirks that matter:
// the body rows omit their </tr>, and the Kürzel is a <th scope="row">, not a <td>.
const head = (modified) => `<html><head>
<meta property="article:modified_time" content="${modified}" />
</head><body>`;

const GRID = `${head('2026-07-24T12:05:00+00:00')}
<h2>Hauptplatz</h2>
<div class="table-responsive mb-5"><table class="table table-striped table-bordered">
<thead><tr><th nowrap scope="row">K&#252;rzel</th><th nowrap>Location</th>
<th nowrap align="center" scope="col">14-15h</th><th nowrap align="center" scope="col">15-16h</th><th nowrap align="center" scope="col">20-21h</th></tr></thead>
<tbody>
<tr><th nowrap scope="row">H1</th><td nowrap>Dreifaltigkeitss&#228;ule</td><td nowrap align="center"><a href="https://pflasterspektakel.at/de/programm/kuenstlerinnen/?artist=2724" style="font-size:12px;">Agn&#279; Muralyt&#279;</a><br><span style="font-size:10px;">(Figuren- und Objekttheater, Tanz)</span></td><td nowrap align="center"><a href="https://pflasterspektakel.at/de/programm/kuenstlerinnen/?artist=3246">Willstreet</a><br><span>(Comedy, Musik)</span></td><td nowrap align="center"><a target="_blank" href="https://pflasterspektakel.at/de/programm/feuershows">Feuershows</a></td>
<tr><th nowrap scope="row">H2</th><td nowrap>Brunnen</td><td nowrap align="center"></td><td nowrap align="center"><a href="?artist=99">Demenzio</a><br><span>(Clownerie)</span></td><td nowrap align="center"></td>
<tr><th nowrap scope="row">H3</th><td nowrap>Leerer Spielort</td><td nowrap align="center"></td><td nowrap align="center"></td><td nowrap align="center"></td>
</tbody></table></div>
</body></html>`;

const NO_GRID = `${head('2026-07-16T06:34:48+00:00')}
<h2>Tagesprogramm</h2><p>Aktuell ist noch kein Tagesprogramm verf&#252;gbar.</p></body></html>`;

const SRC = { url: 'https://pflasterspektakel.at/de/programm/tagesprogramm/', town: 'Linz' };
// 2026-07-24 14:00 Vienna — i.e. crawling on the day the grid was published.
const ON_THE_DAY = new Date('2026-07-24T12:00:00Z');

test('parses the grid into one event per Spielort, with the day from the source itself', () => {
  const events = parsePflasterEvents(GRID, SRC, { now: ON_THE_DAY });
  assert.equal(events.length, 2); // H3 has no acts -> no event

  assert.deepEqual(events[0], {
    title: 'Pflasterspektakel H1: Dreifaltigkeitssäule',
    date_start: '2026-07-24', time_start: '14:00',
    date_end: '2026-07-24', time_end: '21:00',
    venue: 'Dreifaltigkeitssäule, Hauptplatz',
    address: null, town: 'Linz',
    categories: ['festival', 'culture', 'music', 'party'],
    is_free: null, age_min: null, age_max: null, indoor: null,
    description: 'Straßenkunst beim Pflasterspektakel am Spielort „Dreifaltigkeitssäule“ (Hauptplatz). '
      + '3 Auftritte: 14:00 Agnė Muralytė (Figuren- und Objekttheater, Tanz) · 15:00 Willstreet (Comedy, Musik) · 20:00 Feuershows.',
    source_url: 'https://pflasterspektakel.at/de/programm/tagesprogramm/',
  });

  // Gaps are real: H2 plays only the 15-16h slot, so its span is that slot alone
  // rather than the festival's opening hours.
  assert.equal(events[1].time_start, '15:00');
  assert.equal(events[1].time_end, '16:00');
});

// The guard the whole adapter rests on. The page is ONE grid overwritten daily
// and carries no date; our nightly cron fires ~06:00 Vienna, before the day's
// grid is up. Without this, that crawl stamps yesterday's line-up as today's.
test('refuses a grid the source did not stamp today (stale page = no events)', () => {
  const nextDayEarly = new Date('2026-07-25T04:00:00Z'); // 06:00 Vienna, grid still yesterday's
  assert.deepEqual(parsePflasterEvents(GRID, SRC, { now: nextDayEarly }), []);

  const dayBefore = new Date('2026-07-23T12:00:00Z');
  assert.deepEqual(parsePflasterEvents(GRID, SRC, { now: dayBefore }), []);
});

test('an undateable grid is never stored', () => {
  const noStamp = GRID.replace(/<meta property="article:modified_time"[^>]*>/, '');
  assert.deepEqual(parsePflasterEvents(noStamp, SRC, { now: ON_THE_DAY }), []);
});

test('the 362 days a year with no Tagesprogramm yield nothing, not junk', () => {
  assert.deepEqual(parsePflasterEvents(NO_GRID, SRC, { now: new Date('2026-07-16T08:00:00Z') }), []);
});

// Half the Spielort names are generic sub-spots. A bare "Brunnen" seeded into the
// shared venues registry would hand the festival's fountain to every other Linz
// event naming a Brunnen (tasks/lessons.md, 2026-07-14).
test('venue is qualified by its area so it cannot poison the venues registry', () => {
  const events = parsePflasterEvents(GRID, SRC, { now: ON_THE_DAY });
  assert.equal(events[1].venue, 'Brunnen, Hauptplatz');
  assert.ok(!events.some((e) => e.venue === 'Brunnen'));
});

test('falls back to the JSON-LD dateModified when the meta tag is absent', () => {
  const jsonLdOnly = GRID.replace(/<meta property="article:modified_time"[^>]*>/,
    '<script type="application/ld+json">{"dateModified":"2026-07-24T12:05:00+00:00"}</script>');
  assert.equal(parsePflasterEvents(jsonLdOnly, SRC, { now: ON_THE_DAY }).length, 2);
});

// Every stage runs on the same day within ~300m of the others, so dedup's
// sameLocation() passes for EVERY pair and the title is the only thing keeping
// two stages apart. Before the Kürzel went into the title, "Landhaus" (Altstadt)
// and "Landhaus Arkadenhof" (Spektakel-Oasen) auto-merged on the real 2025 grid
// via titlesMatch()'s substring rule — and titleSubstitution() did not catch it,
// because it only fires on swapped words, not added ones.
test('two stages whose names contain one another are never auto-merged', () => {
  const rows = [
    { id: 1, kind: 'event', title: 'Pflasterspektakel A4: Landhaus', starts_at: '2026-07-24T14:00', town: 'Linz' },
    { id: 2, kind: 'event', title: 'Pflasterspektakel S4: Landhaus Arkadenhof', starts_at: '2026-07-24T14:00', town: 'Linz' },
    { id: 3, kind: 'event', title: 'Pflasterspektakel P4: Pfarrplatz', starts_at: '2026-07-24T14:00', town: 'Linz' },
    { id: 4, kind: 'event', title: 'Pflasterspektakel P3: Pfarrplatz Bäume', starts_at: '2026-07-24T14:00', town: 'Linz' },
  ];
  for (const row of rows) {
    assert.equal(findDuplicate(row, rows.filter((r) => r.id !== row.id)), null, `${row.title} was merged away`);
  }
  // …and the bare-name form this protects against really would collide.
  assert.notEqual(
    findDuplicate(
      { kind: 'event', title: 'Pflasterspektakel: Landhaus', starts_at: '2026-07-24T14:00', town: 'Linz' },
      [{ id: 9, kind: 'event', title: 'Pflasterspektakel: Landhaus Arkadenhof', starts_at: '2026-07-24T14:00', town: 'Linz' }],
    ),
    null,
  );
});

test('parseSlot reads hour columns and rejects anything else', () => {
  assert.deepEqual(parseSlot('14-15h'), { start: '14:00', end: '15:00' });
  assert.deepEqual(parseSlot('22-23h'), { start: '22:00', end: '23:00' });
  assert.deepEqual(parseSlot('9-10h'), { start: '09:00', end: '10:00' });
  assert.equal(parseSlot('Location'), null);
  assert.equal(parseSlot(''), null);
});

test('the grid day is Vienna wall-clock, not the host timezone', () => {
  // 23:30 UTC on the 24th is already the 25th in Vienna (hard rule 3).
  assert.equal(viennaDay(gridModifiedAt(`${head('2026-07-24T23:30:00+00:00')}</body></html>`)), '2026-07-25');
});

const HOME = '<div id="datum">23. - 25. Juli 2026</div>';
const KALEIDOSKOP = `<h2>Kaleidoskopnachmittage, täglich um 17.00 Uhr</h2>
<p>In dem einstündigen Programm treten Künstler*innen auf. Gratis-Sitzplatzkarten.</p>
<h2>Kaleidoskopnächte, täglich um 20.00 &amp; 22.30 Uhr</h2>
<p>Eine 90minütigen Revueshow.</p>${HOME}`;
const FIRE = '<p>Die Magie des Feuers zieht von 20 – 23 Uhr in ihren Bann. '
  + `Die Feuershows finden am Hauptplatz und am Pfarrplatz statt.</p>${HOME}`;

test('reads the annual festival range only from the official #datum field', () => {
  assert.deepEqual(pflasterFestivalDates(HOME), ['2026-07-23', '2026-07-24', '2026-07-25']);
  assert.deepEqual(pflasterFestivalDates('23. - 25. Juli 2026'), []);
});

test('parses all fixed Kaleidoskop sessions with their published durations', () => {
  const events = parsePflasterEvents(KALEIDOSKOP, {
    url: 'https://pflasterspektakel.at/de/programm/kaleidoskopshows/', town: 'Linz',
  });
  assert.equal(events.length, 9);
  assert.deepEqual(events.slice(0, 3).map((e) => [e.time_start, e.date_end, e.time_end]), [
    ['17:00', '2026-07-23', '18:00'],
    ['20:00', '2026-07-23', '21:30'],
    ['22:30', '2026-07-24', '00:00'],
  ]);
  assert.deepEqual(events[0].categories, ['festival', 'culture', 'family']);
  assert.equal(events[0].is_free, true);
  assert.equal(events[0].venue, 'LINZ AG Spektakelzelt');
});

test('parses one fixed fire-show block per published square and festival day', () => {
  const events = parsePflasterEvents(FIRE, {
    url: 'https://pflasterspektakel.at/de/programm/feuershows/', town: 'Linz',
  });
  assert.equal(events.length, 6);
  assert.deepEqual(events.slice(0, 2).map((e) => [e.venue, e.time_start, e.time_end]), [
    ['Hauptplatz', '20:00', '23:00'],
    ['Pfarrplatz', '20:00', '23:00'],
  ]);
  assert.ok(events.every((e) => e.is_free === null && e.indoor === false));
});
