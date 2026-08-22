import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('event detail gets bounded related dates and distinct venue events from the server', () => {
  const db = read('lib/db.js');
  const route = read('app/api/events/route.js');
  const page = read('app/page.js');

  assert.match(db, /export async function relatedUpcomingEvents/);
  assert.match(db, /DISTINCT ON \(lower\(trim\(e\.title\)\)\)/);
  assert.match(db, /Math\.min\(20/);
  assert.match(db, /position\(' ' \|\| lower\(trim\(e\.venue\)\)/);
  assert.match(route, /relatedUpcomingEvents\(event\)/);
  assert.match(page, /data\.related\.series/);
  assert.match(page, /data\.related\.venue/);
  assert.match(page, /const venueSiblings = related\?\.venue \|\| \[\]/);
  assert.doesNotMatch(page, /const venueSiblings = place\s*\? \(events \|\| \[\]\)/);
});

test('city discovery page leads to the map without a statistics block', () => {
  const page = read('app/events/seo-page.js');

  assert.doesNotMatch(page, /Kurzantwort|Veranstaltungen<\/strong> im Umkreis|Angezeigt werden/);
  assert.match(page, /Auf der Karte ansehen/);
  assert.match(page, /\?when=all&lat=/);
  assert.ok(page.indexOf('Auf der Karte ansehen') < page.indexOf('aria-label="Themen"'));
});

test('country and city discovery pages share the Okolo brand and polished navigation', () => {
  const index = read('app/events/page.js');
  const city = read('app/events/seo-page.js');
  const brand = read('app/events/events-brand.js');

  assert.match(index, /<EventsBrand \/>/);
  assert.match(city, /<EventsBrand \/>/);
  assert.match(brand, /brandName}>okolo/);
  assert.match(index, /Zur Event-Karte/);
  assert.match(index, /className=\{styles\.cityCard\}/);
});
