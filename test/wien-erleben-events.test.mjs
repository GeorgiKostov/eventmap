import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWienDetailLinks, parseWienErlebenDetailHtml } from '../lib/wien-erleben-events.js';

const node = {
  '@context': 'https://schema.org', '@type': 'Event', name: 'Yoga Kids!',
  additionalProperty: [{ '@type': 'PropertyValue', name: 'Für Kinder', value: true }],
  addresses: [{ '@type': 'Address', street: 'Apostelgasse 25/2/1', addressLocality: 'Vienna', name: 'The Yoga Family' }],
  description: 'Source prose that must never be copied.',
  subEvent: [
    { '@type': 'Event', startDate: '2026-11-12T16:00:00+01:00', endDate: '2026-11-12T17:00:00+01:00' },
    { '@type': 'Event', startDate: '2026-11-19T16:00:00+01:00' },
    { '@type': 'Event', name: 'no date' },
  ],
};
const img = { '@type': 'ImageObject', name: 'x.jpg' };
const page = `<script type="application/ld+json">${JSON.stringify(img)}</script>
<script type="application/ld+json">${JSON.stringify(node)}</script>`;

test('detail links: unique, own listing excluded', () => {
  const html = `<a href="https://www.wien.gv.at/veranstaltungen/kinder">k</a>
    <a href="https://www.wien.gv.at/veranstaltungen/yoga-kids">a</a>
    <a href="https://www.wien.gv.at/veranstaltungen/yoga-kids">b</a>`;
  assert.deepEqual(extractWienDetailLinks(html, 'https://www.wien.gv.at/veranstaltungen/kinder'),
    ['https://www.wien.gv.at/veranstaltungen/yoga-kids']);
});

test('subEvent occurrences become Vienna wall-clock events, facts only', () => {
  const evs = parseWienErlebenDetailHtml(page, 'https://www.wien.gv.at/veranstaltungen/yoga-kids', { town: 'Wien' });
  assert.equal(evs.length, 2); // dateless occurrence skipped
  assert.deepEqual([evs[0].date_start, evs[0].time_start, evs[0].date_end, evs[0].time_end],
    ['2026-11-12', '16:00', '2026-11-12', '17:00']);
  assert.equal(evs[1].time_end, null);
  assert.equal(evs[0].town, 'Wien');
  assert.equal(evs[0].venue, 'The Yoga Family');
  assert.equal(evs[0].address, 'Apostelgasse 25/2/1');
  assert.equal(evs[0].description, null);
  assert.deepEqual(evs[0].categories, ['family']);
  assert.equal(evs[0].source_url, 'https://www.wien.gv.at/veranstaltungen/yoga-kids');
});

test('no usable JSON-LD → no events', () => {
  assert.deepEqual(parseWienErlebenDetailHtml('<p>x</p>', 'u', {}), []);
});
