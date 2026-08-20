import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchSalzburgarenaEvents,
  parseSalzburgarenaDetail,
  parseSalzburgarenaOverview,
  salzburgarenaApiUrl,
} from '../lib/salzburgarena-events.js';

const SOURCE = 'https://www.salzburgarena.at/de/events-tickets/';
const API = 'https://www.salzburgarena.at/de_AT/api/events/overview/2286';
const DETAIL = 'https://www.salzburgarena.at/de/events-tickets/the-addams-family-1197/';

const SHELL = `<section class="events-overview" data-api-url="/de_AT/api/events/overview/2286"></section>`;
const FRAGMENT = `
  <div class="h3">Oktober 2026</div>
  <a class="events-overview-item col-12" href="/de/events-tickets/the-addams-family-1197/">
    <span class="events-overview-item__category-inner">Salzburgarena</span>
    <div class="events-overview-item__date">01. Oktober 2026</div>
    <div class="events-overview-item__title"> The Addams Family </div>
  </a>
  <a class="events-overview-item" href="/de/events-tickets/no-date/">
    <div class="events-overview-item__title">No date</div>
  </a>`;
const DETAIL_JSONLD = `<div class="event-detail-content--opening-hours-info pr-3">01. Oktober 2026, 19:30 Uhr</div>
<script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Event","name":" The Addams Family ",
   "url":"${DETAIL}","startDate":"2026-10-01T19:30:00","endDate":"2026-10-01T22:00:00",
   "location":{"@type":"Place","name":"salzburgarena","address":{"@type":"PostalAddress",
     "streetAddress":"Am Messezentrum 1","addressLocality":"Salzburg","postalCode":"5020","addressCountry":"AT"}}}
</script>`;

test('salzburgarenaApiUrl resolves the official data-api-url', () => {
  assert.equal(salzburgarenaApiUrl(SHELL, SOURCE), API);
  assert.equal(salzburgarenaApiUrl('<section class="events-overview"></section>', SOURCE), null);
});

test('parseSalzburgarenaOverview extracts dated cards and skips undated cards', () => {
  assert.deepEqual(parseSalzburgarenaOverview(FRAGMENT, API), [{
    title: 'The Addams Family',
    date_start: '2026-10-01',
    venue: 'Salzburgarena',
    source_url: DETAIL,
  }]);
});

test('parseSalzburgarenaDetail uses Event JSON-LD facts and keeps descriptions null', () => {
  const [event] = parseSalzburgarenaDetail(DETAIL_JSONLD, DETAIL, {
    title: 'The Addams Family', date_start: '2026-10-01', venue: 'Salzburgarena', source_url: DETAIL,
  }, { town: 'Salzburg' });
  assert.equal(event.title, 'The Addams Family');
  assert.equal(event.date_start, '2026-10-01');
  assert.equal(event.time_start, '19:30');
  assert.equal(event.time_end, '22:00');
  assert.equal(event.venue, 'salzburgarena');
  assert.equal(event.address, 'Am Messezentrum 1');
  assert.equal(event.town, 'Salzburg');
  assert.equal(event.description, null);
  assert.equal(event.source_url, DETAIL);
});

test('fetchSalzburgarenaEvents follows shell → fragment → detail and falls back to the official card date', async () => {
  const responses = new Map([
    [SOURCE, { ok: true, text: async () => SHELL }],
    [API, { ok: true, text: async () => FRAGMENT }],
    [DETAIL, { ok: true, text: async () => DETAIL_JSONLD }],
  ]);
  const fetched = [];
  const events = await fetchSalzburgarenaEvents({ url: SOURCE, town: 'Salzburg' }, {
    fetchFn: async (url) => { fetched.push(url); return responses.get(url); },
    robotsFn: async () => true,
  });
  assert.deepEqual(fetched, [SOURCE, API, DETAIL]);
  assert.equal(events.length, 1);
  assert.equal(events[0].time_start, '19:30');

  const fallback = parseSalzburgarenaDetail('<html></html>', DETAIL, {
    title: 'The Addams Family', date_start: '2026-10-01', venue: 'Salzburgarena', source_url: DETAIL,
  }, { town: 'Salzburg' });
  assert.equal(fallback[0].date_start, '2026-10-01');
  assert.equal(fallback[0].time_start, null);
});
