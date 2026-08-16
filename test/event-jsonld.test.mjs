import test from 'node:test';
import assert from 'node:assert/strict';
import { eventJsonLd, isoLocalEventTime } from '../lib/event-jsonld.js';

test('emits canonical URL, owned image, actual country, and a factual fallback description', () => {
  const ld = eventJsonLd({
    id: '9007199254740993', kind: 'event', title: 'Kinderfest', description: null,
    starts_at: '2026-08-08T14:00', ends_at: null, all_day: false,
    tz: 'Europe/Sofia', country: 'BG', venue: 'City Park', town: 'Sofia',
    address: null, lat: 42.69, lng: 23.32, is_free: null, age_min: null,
    source_url: 'https://example.org/event',
  });

  assert.equal(ld.url, 'https://www.okolo.events/event/9007199254740993');
  assert.deepEqual(ld.image, ['https://www.okolo.events/event/9007199254740993/opengraph-image']);
  assert.equal(ld.location.address.addressCountry, 'BG');
  assert.equal(ld.description, 'Kinderfest in City Park on 2026-08-08.');
  assert.equal(ld.startDate, '2026-08-08T14:00:00+03:00');
  assert.equal(ld.endDate, undefined);
});

test('uses DST-correct offsets and keeps unknown times as bare dates', () => {
  assert.equal(isoLocalEventTime('2026-03-28T19:00', 'Europe/Vienna'), '2026-03-28T19:00:00+01:00');
  assert.equal(isoLocalEventTime('2026-03-30T19:00', 'Europe/Vienna'), '2026-03-30T19:00:00+02:00');

  const ld = eventJsonLd({
    id: '1', kind: 'event', title: 'Market', starts_at: '2026-08-09', ends_at: null,
    all_day: false, country: 'AT', town: 'Linz', lat: 48.3, lng: 14.3,
    is_free: 1, age_min: null,
  });
  assert.equal(ld.startDate, '2026-08-09');
  assert.equal(ld.offers.price, 0);
});

test('an invalid legacy start date emits no Event structured data', () => {
  assert.equal(eventJsonLd({
    id: '54438', kind: 'event', title: 'Malformed legacy event',
    starts_at: '2026-08-XX', ends_at: null, all_day: false,
    country: 'DE', lat: 53.55, lng: 9.99,
  }), null);
});
