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

test('city discovery page leads to the map with compact actionable scope and source evidence', () => {
  const page = read('app/events/seo-page.js');

  assert.doesNotMatch(page, /Kurzantwort|Veranstaltungen<\/strong> im Umkreis|Angezeigt werden/);
  assert.match(page, /Auf der Karte ansehen/);
  assert.match(page, /\?when=all&lat=/);
  assert.match(page, /total\.toLocaleString\('de-AT'\)/);
  assert.match(page, /Stand \{freshness\}/);
  assert.match(page, /Quellen &amp; Prüfprozess/);
  assert.match(page, /cityIntentPath\(city, 'kinder'\)/);
  assert.match(page, /group\.sourceCount === 1 \? 'benannten Quelle' : 'benannten Quellen'/);
  assert.doesNotMatch(page, /als gratis gekennzeichnet|benannte Quellen in der angezeigten Auswahl|zuletzt aktualisiert/);
  assert.match(page, /href=\{`\/events\/\$\{city\.slug\}\/wochenende`\}/);
  assert.doesNotMatch(page, /href=\{`\/weekend\/\$\{channel\.slug\}`\}/);
  assert.ok(page.indexOf('Auf der Karte ansehen') < page.indexOf('aria-label="Themen"'));
});

test('country and city discovery pages share the Okolo brand and polished navigation', () => {
  const index = read('app/events/page.js');
  const city = read('app/events/seo-page.js');
  const brand = read('app/okolo-brand.js');

  assert.match(index, /<OkoloBrand \/>/);
  assert.match(city, /<OkoloBrand channelHandle=\{channel\?\.handle\} \/>/);
  assert.match(brand, /okolo-brand-name">okolo/);
  assert.match(brand, /ariaLabel = 'Okolo'/);
  assert.match(index, /className=\{styles\.cityCard\}/);
});
