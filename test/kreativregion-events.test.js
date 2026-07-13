import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveEventLinks, archivePageCount, eventIdFromDetail, venueFromDetail,
  parseKreativregionIcs, townFromFacts,
} from '../lib/kreativregion-events.js';

test('extracts Kreativregion archive links and pagination', () => {
  const html = `<article itemscope="" itemtype="https://schema.org/Event"><h2><a href="https://kreativ.region-stuttgart.de/termine/foo/">Foo</a></h2></article>
    <a href="https://kreativ.region-stuttgart.de/termine/page/5/">5</a>`;
  assert.deepEqual(archiveEventLinks(html), ['https://kreativ.region-stuttgart.de/termine/foo/']);
  assert.equal(archivePageCount(html), 5);
});

test('extracts detail calendar id and location without prose', () => {
  const html = `<div><h5>Ort</h5>Galerie b in der Stadtbibliothek Stuttgart</div>
    <a href="https://kreativ.region-stuttgart.de/feed/calendar/?id=97113">ICS</a>`;
  assert.equal(eventIdFromDetail(html), 97113);
  assert.equal(venueFromDetail(html), 'Galerie b in der Stadtbibliothek Stuttgart');
});

test('parses factual iCal fields and leaves prose/coordinates null', () => {
  const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nURL;VALUE=URI:https://kreativ.region-stuttgart.de/termine/foo/\nDESCRIPTION:Do not copy this prose\nDTSTART:20260714T160000\nDTEND:20260714T190000\nLOCATION:\nSUMMARY:Kinder Workshop in Stuttgart\nEND:VEVENT\nEND:VCALENDAR`;
  const event = parseKreativregionIcs(ics, { venue: 'Stadtbibliothek Stuttgart' });
  assert.equal(event.date_start, '2026-07-14');
  assert.equal(event.time_start, '16:00');
  assert.equal(event.venue, 'Stadtbibliothek Stuttgart');
  assert.equal(event.town, 'Stuttgart');
  assert.equal(event.description_short, null);
  assert.equal(event.lat, null);
  assert.deepEqual(event.categories, ['workshop', 'family']);
});

test('town detection only returns named source facts', () => {
  assert.equal(townFromFacts('Galerie Stadt Sindelfingen'), 'Sindelfingen');
  assert.equal(townFromFacts('Villa Merkel'), 'Esslingen');
  assert.equal(townFromFacts('Areal Süd'), 'Stuttgart');
  assert.equal(townFromFacts('Online'), null);
});

test('converts UTC iCal timestamps to Europe/Berlin', () => {
  const event = parseKreativregionIcs(`BEGIN:VEVENT\nURL:https://kreativ.region-stuttgart.de/termine/utc/\nDTSTART:20261201T180000Z\nDTEND:20261201T193000Z\nSUMMARY:UTC test in Stuttgart\nEND:VEVENT`);
  assert.equal(event.date_start, '2026-12-01');
  assert.equal(event.time_start, '19:00');
  assert.equal(event.time_end, '20:30');
});
