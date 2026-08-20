import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBrucknerhausPage, fetchBrucknerhausEvents } from '../lib/brucknerhaus-events.js';
import { parseKapuPage, fetchKapuEvents } from '../lib/kapu-events.js';
import { parseTabakfabrikListing, fetchTabakfabrikEvents } from '../lib/tabakfabrik-events.js';
import { parseSchlachthofWelsPage } from '../lib/schlachthof-wels-events.js';
import { fingerprintCms, ROUTABLE_CMS } from '../lib/cms-fingerprint.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('Brucknerhaus parser keeps dated cards and exact links', () => {
  const events = parseBrucknerhausPage(fixture('brucknerhaus-page.html'), { url: 'https://www.brucknerhaus.at/programm/veranstaltungen', town: 'Linz' });
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    title: 'Chailly, Malofeev & Filarmonica della Scala', date_start: '2026-09-04', time_start: '19:30',
    date_end: null, time_end: null, venue: 'Brucknerhaus', address: null, town: 'Linz', categories: ['music'],
    is_free: null, age_min: null, age_max: null, indoor: null, description: null,
    source_url: 'https://www.brucknerhaus.at/programm/veranstaltungen/chailly-04.09.2026-19-30',
  });
  assert.deepEqual(events[1].categories, ['family']);
  const dayThirty = parseBrucknerhausPage(
    '<div class="event__element"><div class="event__date"><span>Mi,</span><span>30.</span><span>Dez</span><span>26</span></div><div class="event__location"><span>19:30</span><span>Brucknerhaus</span></div><div class="event__name">Silvesterkonzert</div><a href="/programm/veranstaltungen/silvester-30.12.2026-19-30">Details</a></div>',
    { url: 'https://www.brucknerhaus.at/programm/veranstaltungen', town: 'Linz' },
  );
  assert.equal(dayThirty[0].date_start, '2026-12-30');
});

test('KAPU parser drops explicitly cancelled cards', () => {
  const events = parseKapuPage(fixture('kapu-page.html'), { url: 'https://www.kapu.or.at/events', town: 'Linz' });
  assert.equal(events.length, 1);
  assert.equal(events[0].date_start, '2026-09-18');
  assert.equal(events[0].categories[0], 'music');
});

test('Tabakfabrik listing exposes detail metadata and two-hop adapter keeps visible time', async () => {
  const listing = fixture('tabakfabrik-listing.html');
  assert.equal(parseTabakfabrikListing(listing, { url: 'https://tabakfabrik-linz.at/events/' }).length, 1);
  const events = await fetchTabakfabrikEvents({ url: 'https://tabakfabrik-linz.at/events/', town: 'Linz' }, {
    shellHtml: listing,
    robotsFn: async () => true,
    fetchImpl: async (url) => ({ ok: true, text: async () => url.includes('repair-cafe') ? fixture('tabakfabrik-detail.html') : '' }),
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].date_start, '2026-09-03');
  assert.equal(events[0].time_start, '17:00');
  assert.equal(events[0].time_end, '19:00');
  assert.equal(events[0].source_url, 'https://tabakfabrik-linz.at/events/repair-cafe-3-september-2026/');
});

test('Alter Schlachthof parser reads dated TYPO3 rows', () => {
  const events = parseSchlachthofWelsPage(fixture('schlachthof-wels-page.html'), { url: 'https://www.schlachthofwels.at/programm/', town: 'Wels' });
  assert.equal(events.length, 1);
  assert.equal(events[0].date_start, '2026-07-18');
  assert.equal(events[0].venue, 'Alter Schlachthof Wels');
  assert.deepEqual(events[0].categories, ['music', 'festival']);
});

test('Brucknerhaus fetch follows paginated pages with robots checks', async () => {
  const robots = [];
  const fetched = [];
  const events = await fetchBrucknerhausEvents({ url: 'https://www.brucknerhaus.at/programm/veranstaltungen', town: 'Linz' }, {
    shellHtml: fixture('brucknerhaus-page.html'),
    maxPages: 2,
    robotsFn: async (url) => { robots.push(url); return true; },
    fetchImpl: async (url) => { fetched.push(url); return { ok: true, text: async () => fixture('brucknerhaus-page.html') }; },
  });
  assert.equal(events.length, 2);
  assert.deepEqual(fetched, ['https://www.brucknerhaus.at/programm/veranstaltungen?page=2']);
  assert.deepEqual(robots, [
    'https://www.brucknerhaus.at/programm/veranstaltungen',
    'https://www.brucknerhaus.at/programm/veranstaltungen?page=2',
  ]);
});

test('venue adapter hosts fingerprint to routable CMS values', () => {
  const cases = [
    ['https://www.brucknerhaus.at/programm/veranstaltungen', 'brucknerhaus'],
    ['https://www.kapu.or.at/events', 'kapu'],
    ['https://tabakfabrik-linz.at/events/', 'tabakfabrik'],
    ['https://www.schlachthofwels.at/programm/', 'schlachthof-wels'],
  ];
  for (const [url, cms] of cases) {
    assert.equal(fingerprintCms('', url)?.cms, cms);
    assert.equal(ROUTABLE_CMS.has(cms), true);
  }
});
