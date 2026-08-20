import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRockhouseEvents, parseRockhouseEventsHtml } from '../lib/rockhouse-events.js';

function nuxtFixture() {
  const payload = [];
  payload[0] = ['ShallowReactive', 1];
  payload[1] = { data: 2 };
  payload[2] = ['ShallowReactive', 3];
  payload[3] = { listing: 4 };
  payload[4] = [5, 14];
  payload[5] = { _id: 6, name: 7, start: 8, end: 9, url: 10, locationName: 11 };
  payload[6] = 'event-1';
  payload[7] = 'Anti Disco';
  payload[8] = '2026-08-28T19:00:00.000Z';
  payload[9] = '2026-08-29T02:00:00.000Z';
  payload[10] = 'anti-disco-lliis9';
  payload[11] = 'Ganzes Haus';
  payload[14] = { _id: 15, name: 16, start: 17, end: 18, url: 19, locationName: 20 };
  payload[15] = 'event-2';
  payload[16] = 'Workshop';
  payload[17] = '2026-09-01T16:30:00.000Z';
  payload[18] = null;
  payload[19] = 'workshop-abc';
  payload[20] = 'Rockhouse Saal';
  return `<script id="__NUXT_DATA__">${JSON.stringify(payload)}</script>`;
}

test('resolves the official Nuxt listing and converts UTC instants to Vienna wall-clock', () => {
  assert.deepEqual(parseRockhouseEventsHtml(nuxtFixture(), {
    url: 'https://www.rockhouse.at/de/events', town: 'Salzburg',
  }), [{
    title: 'Anti Disco', date_start: '2026-08-28', time_start: '21:00',
    date_end: '2026-08-29', time_end: '04:00', venue: 'Ganzes Haus',
    address: null, town: 'Salzburg', categories: ['party', 'music'], is_free: null,
    age_min: null, age_max: null, indoor: null, description: null,
    source_url: 'https://www.rockhouse.at/de/events/anti-disco-lliis9',
  }, {
    title: 'Workshop', date_start: '2026-09-01', time_start: '18:30',
    date_end: null, time_end: null, venue: 'Rockhouse Saal', address: null,
    town: 'Salzburg', categories: ['workshop'], is_free: null, age_min: null,
    age_max: null, indoor: null, description: null,
    source_url: 'https://www.rockhouse.at/de/events/workshop-abc',
  }]);
});

test('deduplicates repeated listing records and fails closed on malformed/undated data', () => {
  const html = nuxtFixture().replace('event-2', 'event-1').replace('Workshop', 'Duplicate');
  assert.equal(parseRockhouseEventsHtml(html).length, 1);
  assert.deepEqual(parseRockhouseEventsHtml('<script id="__NUXT_DATA__">not json</script>'), []);
  assert.deepEqual(parseRockhouseEventsHtml('<html></html>'), []);
});

test('checks robots before fetching the official listing', async () => {
  let fetched = 0;
  assert.deepEqual(await fetchRockhouseEvents({ url: 'https://www.rockhouse.at/de/events', town: 'Salzburg' }, {
    robotsFn: async () => false,
    fetchImpl: async () => { fetched++; return { ok: true, text: async () => nuxtFixture() }; },
  }), []);
  assert.equal(fetched, 0);
});
