import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZooLinzEvents, fetchZooLinzEvents, ZOO_LINZ_SOURCE_URL } from '../lib/zoo-linz-events.js';

const item = (when, title, body = '<p>Text</p>') => `<h2 class="month-header">November 2026</h2>
<span class="font-semibold"><div class="field field--name-field-datum field--type-daterange field__item">${when}</div>
 - ${title}
</span><div class="accordion-content">${body}</div>`;

test('parses weekday-prefixed dates, time ranges and titles', () => {
  const [ev] = parseZooLinzEvents(item('So., 29.11.2026 11:00–16:00', '1. Advent im Zoo'));
  assert.equal(ev.title, '1. Advent im Zoo');
  assert.equal(ev.date_start, '2026-11-29');
  assert.equal(ev.time_start, '11:00');
  assert.equal(ev.time_end, '16:00');
  assert.equal(ev.venue, 'Zoo Linz');
  assert.equal(ev.town, 'Linz');
  assert.deepEqual(ev.categories, ['family']);
  assert.equal(ev.description, null);
  assert.equal(ev.source_url, ZOO_LINZ_SOURCE_URL);
});

test('adult-only courses are not labelled family; invalid dates and untimed rows are handled', () => {
  const html = item('Do., 10.12.2026 13:00–18:00', 'Sachkundenachweis für Papageienvögel')
    + item('Fr., 31.02.2026 10:00', 'Unmöglich')
    + item('Sa., 12.12.2026', 'Ganztags');
  const events = parseZooLinzEvents(html);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0].categories, ['workshop']);
  assert.equal(events[1].time_start, null);
});

test('fetch honours robots and uses the shell html when given', async () => {
  const html = item('Fr., 20.11.2026 14:00–15:30', 'Adventkranz-Binden');
  assert.equal((await fetchZooLinzEvents({ url: ZOO_LINZ_SOURCE_URL }, { shellHtml: html, robotsFn: async () => true })).length, 1);
  assert.deepEqual(await fetchZooLinzEvents({ url: ZOO_LINZ_SOURCE_URL }, { shellHtml: html, robotsFn: async () => false }), []);
});
