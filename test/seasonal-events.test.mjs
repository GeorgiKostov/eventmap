import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEASONAL_THEMES, seasonalTheme, matchesSeasonalTheme, seasonalWindow, activeSeasonalThemes, easterSunday, nextViennaMidnight, parseSeasonalThemes } from '../lib/seasonal-events.js';
import { STRINGS } from '../lib/i18n.js';

const event = (title, starts_at = '2026-12-05', extra = {}) => ({ title, starts_at, kind: 'event', ...extra });

test('Christmas market titles are distinct from other Christmas events across source spellings', () => {
  for (const title of ['Wiener Christkindlmarkt', 'Christkindmarkt Salzburg', 'Weihnachtsmarkt am Rathaus', 'Advent-Markt', 'Adventsmarkt', 'Adventsbasar', 'Christmas Market', 'Weihnachtsdorf Maria-Theresien-Platz']) {
    assert.equal(seasonalTheme(event(title)), 'christmas_market', title);
    assert.equal(matchesSeasonalTheme(event(title), 'christmas'), false, title);
  }
  for (const title of ['Weihnachtskonzert', 'Adventsingen', 'Krampuslauf', 'Nikolausbesuch', 'Christmas workshop']) {
    assert.equal(seasonalTheme(event(title)), 'christmas', title);
  }
});

test('Halloween and New Year match their holiday dates without relabeling ordinary events', () => {
  assert.equal(seasonalTheme(event('Halloween im Schloss', '2026-10-31')), 'halloween');
  assert.equal(seasonalTheme(event('Silvesterlauf', '2026-12-31')), 'new_year');
  assert.equal(seasonalTheme(event('Neujahrskonzert', '2027-01-01')), 'new_year');
  for (const ev of [event('Wochenmarkt'), event('Winterkonzert'), event('Nikolaus Harnoncourt: Konzert'), event('Halloween', '2026-05-04'), event('Weihnachtsmuseum', undefined, { kind: 'place' }), event('Konzert', undefined, { description: 'Beside the Christmas market', venue: 'Weihnachtsmarkt' }), event('Weihnachtsmarkt', null)]) {
    assert.equal(seasonalTheme(ev), null, ev.title);
  }
});

test('Adventure titles do not match Advent or override Halloween', () => {
  for (const title of ['Winter Adventure', 'Adventure-Golf im Winter']) {
    assert.equal(seasonalTheme(event(title)), null, title);
  }
  const halloween = event('Halloween im Adventure-Golf', '2026-10-31');
  assert.equal(matchesSeasonalTheme(halloween, 'christmas'), false);
  assert.equal(seasonalTheme(halloween), 'halloween');
  for (const title of ['Adventzauber', 'Adventsingen']) {
    assert.equal(seasonalTheme(event(title)), 'christmas', title);
  }
});

test('fixed seasonal promotions appear and retire on inclusive dates, including across New Year', () => {
  for (const [key, before, first, last, after] of [
    ['halloween', '2026-09-14', '2026-09-15', '2026-11-01', '2026-11-02'],
    ['christmas_market', '2026-09-30', '2026-10-01', '2027-01-06', '2027-01-07'],
    ['christmas', '2026-10-31', '2026-11-01', '2027-01-06', '2027-01-07'],
    ['new_year', '2026-11-30', '2026-12-01', '2027-01-31', '2027-02-01'],
    ['valentine', '2027-01-31', '2027-02-01', '2027-02-15', '2027-02-16'],
  ]) {
    assert.equal(seasonalWindow(key, before), null, `${key}: before`);
    assert.deepEqual(seasonalWindow(key, first), { from: first, to: last }, `${key}: first`);
    assert.deepEqual(seasonalWindow(key, last), { from: last, to: last }, `${key}: last`);
    assert.equal(seasonalWindow(key, after), null, `${key}: after`);
  }
  assert.deepEqual(seasonalWindow('christmas_market', '2027-01-01'), { from: '2027-01-01', to: '2027-01-06' });
  assert.equal(seasonalWindow('constructor', '2026-10-17'), null);
});

test('Gregorian Easter and Fasching dates follow the year, including leap years and late Easter', () => {
  for (const [year, date] of [[2024, '2024-03-31'], [2026, '2026-04-05'], [2027, '2027-03-28'], [2028, '2028-04-16'], [2038, '2038-04-25']]) {
    assert.equal(easterSunday(year), date);
  }
  assert.equal(seasonalWindow('easter', '2027-02-13'), null);
  assert.deepEqual(seasonalWindow('easter', '2027-02-14'), { from: '2027-02-14', to: '2027-03-29' });
  assert.ok(seasonalWindow('easter', '2027-03-29'));
  assert.equal(seasonalWindow('easter', '2027-03-30'), null);
  assert.equal(seasonalWindow('fasching', '2027-01-06'), null);
  assert.deepEqual(seasonalWindow('fasching', '2027-01-07'), { from: '2027-01-07', to: '2027-02-09' });
  assert.ok(seasonalWindow('fasching', '2027-02-09'));
  assert.equal(seasonalWindow('fasching', '2027-02-10'), null);
  assert.deepEqual(seasonalWindow('easter', '2024-02-29'), { from: '2024-02-29', to: '2024-04-01' });
});

test('retiring promotion leaves historical event classification intact and no summer campaigns', () => {
  assert.deepEqual(activeSeasonalThemes('2026-10-17'), ['christmas_market', 'halloween']);
  assert.deepEqual(activeSeasonalThemes('2026-11-02'), ['christmas_market', 'christmas']);
  assert.deepEqual(activeSeasonalThemes('2027-02-14'), ['valentine', 'easter']);
  assert.deepEqual(activeSeasonalThemes('2027-06-01'), []);
  assert.equal(seasonalTheme(event('Halloween im Schloss', '2026-10-31')), 'halloween');
  assert.equal(seasonalWindow('halloween', '2026-11-02'), null);
});

test('spring title matches avoid people, restaurants and unrelated parties', () => {
  for (const [title, date, expected] of [
    ['Valentinstag im Museum', '2027-02-14', 'valentine'],
    ["Valentine’s Day Workshop", '2027-02-14', 'valentine'],
    ['Ostermarkt', '2027-03-20', 'easter'],
    ['Oster-Basteln für Kinder', '2027-03-20', 'easter'],
    ['Easter egg hunt', '2027-03-28', 'easter'],
    ['Kinderfasching', '2027-02-06', 'fasching'],
    ['Faschingsumzug', '2027-02-09', 'fasching'],
    ['Fastnacht im Dorf', '2027-02-09', 'fasching'],
    ['Karl Valentin: Lesung', '2027-02-14', null],
    ['Osteria Konzert', '2027-03-20', null],
    ['Klosterbrunch', '2027-03-20', null],
    ['Eastern sounds', '2027-03-20', null],
    ['Frühlingsmarkt', '2027-03-20', null],
    ['Maskenball', '2027-02-06', null],
    ['Ostermarkt', '2027-12-05', null],
  ]) assert.equal(seasonalTheme(event(title, date)), expected, title);
});

test('next refresh uses Vienna midnight across DST and year boundaries', () => {
  for (const [now, next] of [
    ['2026-10-17T10:00:00Z', '2026-10-17T22:00:00Z'],
    ['2027-03-27T23:30:00Z', '2027-03-28T22:00:00Z'],
    ['2026-10-24T22:30:00Z', '2026-10-25T23:00:00Z'],
    ['2026-12-31T22:00:00Z', '2026-12-31T23:00:00Z'],
  ]) assert.equal(new Date(nextViennaMidnight(new Date(now))).toISOString(), new Date(next).toISOString());
});

test('theme query permits multiple independent choices and rejects invalid or prototype names', () => {
  assert.deepEqual(parseSeasonalThemes(null), []);
  assert.deepEqual(parseSeasonalThemes('halloween'), ['halloween']);
  assert.deepEqual(parseSeasonalThemes('halloween,christmas_market,halloween'), ['halloween', 'christmas_market']);
  for (const value of ['constructor', '__proto__', 'halloween,unknown', 'halloween,', ',']) {
    assert.equal(parseSeasonalThemes(value), null, value);
  }
});

test('theme action adds or removes a choice without moving the map or changing other filters', () => {
  const home = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
  const action = home.slice(home.indexOf('function toggleSeasonalTheme(key)'), home.indexOf('const seasonalFilters'));
  assert.match(action, /current\.includes\(key\)/);
  assert.match(action, /current\.filter/);
  assert.match(action, /\[\.\.\.current, key\]/);
  assert.doesNotMatch(action, /flyAssured|cameraForBounds|setRange|setWhenMode|setSearchCenter|setSearchQuery|setSelectedTown|setPartnerOnly|setKindFilter/);
  assert.doesNotMatch(home, /holidayOverview/);
});

test('all three languages provide every seasonal label and explain additive filtering', () => {
  for (const lang of ['en', 'de', 'bg']) {
    assert.deepEqual(Object.keys(STRINGS[lang].holidays).sort(), Object.keys(SEASONAL_THEMES).sort());
    assert.ok(STRINGS[lang].holidayPreset);
    assert.ok(STRINGS[lang].holidayScope);
  }
});
