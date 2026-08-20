import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPosthofEvents, parsePosthofPage } from '../lib/posthof-events.js';

const SOURCE = 'https://www.posthof.at/';
const NEXT = 'https://www.posthof.at/events?tx_posthofevents_events%5Bpage%5D=1';
const CARD = (title, href, date = 'Mi 26 Aug 26', time = '19:30', genre = 'Indie') => `
<li><div class="description"><div class="pre-header"><span class="pr-4">${date}</span>
<span class="pr-4">${time}</span><span class="pr-4">${genre}</span></div>
<h2><a href="${href}">${title}<br /><span style="opacity: .5">Tour subtitle</span></a></h2></div></li>`;
const PAGE_0 = `<ul class="programmlist">${CARD('Tocotronic', '/event/tocotronic')}
${CARD('Kinderkonzert', '/event/kinderkonzert', 'Sa 05 Sep 26', '15:00', 'Musik & Familie')}
<li class="loadnext"><button hx-post="/events?tx_posthofevents_events%5Bpage%5D=1"></button></li></ul>`;
const PAGE_1 = `<ul class="programmlist">${CARD('Gunkl', '/event/gunkl', 'Sa 19 Sep 26', '19:30', 'Kabarett')}</ul>`;

test('parses official Posthof cards into facts without copying prose', () => {
  const parsed = parsePosthofPage(PAGE_0, { url: SOURCE, town: 'Linz' });
  assert.equal(parsed.next_url, NEXT);
  assert.deepEqual(parsed.events[0], {
    title: 'Tocotronic: Tour subtitle', date_start: '2026-08-26', time_start: '19:30', date_end: null, time_end: null,
    venue: 'Posthof Linz', address: null, town: 'Linz', categories: ['music'], is_free: null,
    age_min: null, age_max: null, indoor: null, description: null,
    source_url: 'https://www.posthof.at/event/tocotronic',
  });
  assert.deepEqual(parsed.events[1].categories, ['music', 'family']);
});

test('follows HTMX pages, deduplicates detail links, and checks robots for every URL', async () => {
  const fetched = [];
  const robots = [];
  const events = await fetchPosthofEvents({ url: SOURCE, town: 'Linz' }, {
    shellHtml: PAGE_0,
    robotsFn: async (url) => { robots.push(url); return true; },
    fetchImpl: async (url) => { fetched.push(url); return { ok: true, text: async () => PAGE_1 }; },
  });
  assert.deepEqual(fetched, [NEXT]);
  assert.deepEqual(robots, [SOURCE, NEXT]);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.title), ['Tocotronic: Tour subtitle', 'Kinderkonzert: Tour subtitle', 'Gunkl: Tour subtitle']);
});

test('stops safely when the next page is disallowed', async () => {
  let fetched = 0;
  const events = await fetchPosthofEvents({ url: SOURCE, town: 'Linz' }, {
    shellHtml: PAGE_0,
    robotsFn: async (url) => url === SOURCE,
    fetchImpl: async () => { fetched++; return { ok: true, text: async () => PAGE_1 }; },
  });
  assert.equal(fetched, 0);
  assert.equal(events.length, 2);
});
