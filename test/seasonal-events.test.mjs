import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonalTheme, matchesSeasonalTheme, holidayWindow } from '../lib/seasonal-events.js';
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

test('holiday window includes the coming January and respects January of the current season', () => {
  assert.deepEqual(holidayWindow('2026-10-16'), { from: '2026-10-16', to: '2027-01-31' });
  assert.deepEqual(holidayWindow('2026-12-31'), { from: '2026-12-31', to: '2027-01-31' });
  assert.deepEqual(holidayWindow('2027-01-01'), { from: '2027-01-01', to: '2027-01-31' });
});

test('all three languages provide seasonal labels and disclose the Austria/date preset', () => {
  for (const lang of ['en', 'de', 'bg']) {
    assert.equal(Object.keys(STRINGS[lang].holidays).length, 4);
    assert.ok(STRINGS[lang].holidayPreset);
    assert.ok(STRINGS[lang].holidayScope);
  }
});
