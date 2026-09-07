import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTheaterDesKindesEvents, fetchTheaterDesKindesEvents, THEATER_DES_KINDES_SOURCE_URL } from '../lib/linz-theatre-events.js';

function performance({ date = '19.09.2026', slugDate = '2026-09-19', time = '16:00', age = '3+', status = '' } = {}) {
  return `<h2 class="wp-block-heading">Oh, wie schön ist Panama</h2><p>${age}</p>
    <p>Sa., ${date}, ${time} Uhr</p><p>${status}</p>
    <p><a href="https://theater-des-kindes.at/vorstellung/${slugDate}-${time.replace(':', '')}-oh-wie-schoen-ist-panama/">Details</a></p>`;
}

test('theatre parser keeps distinct dated performances and explicit minimum age', () => {
  const events = parseTheaterDesKindesEvents(performance() + performance({ date: '20.09.2026', slugDate: '2026-09-20', age: '4+' }));
  assert.equal(events.length, 2);
  assert.equal(events[0].date_start, '2026-09-19');
  assert.equal(events[0].time_start, '16:00');
  assert.equal(events[0].age_min, 3);
  assert.equal(events[1].age_min, 4);
  assert.equal(events[0].address, 'Langgasse 13, 4020 Linz');
  assert.equal(events[0].description, null);
  assert.equal(events[0].time_end, null);
});

test('theatre parser drops invalid dates, conflicting link dates and cancelled performances', () => {
  for (const options of [{ date: '31.02.2026', slugDate: '2026-02-31' }, { slugDate: '2025-09-19' }, { status: 'Abgesagt' }, { time: '25:00' }]) {
    assert.deepEqual(parseTheaterDesKindesEvents(performance(options)), []);
  }
  assert.equal(parseTheaterDesKindesEvents(performance({ status: 'Ausverkauft' })).length, 1);
});

test('theatre crawl follows only observed same-site pagination, with robots checks', async () => {
  const calls = [];
  const src = { url: THEATER_DES_KINDES_SOURCE_URL };
  const events = await fetchTheaterDesKindesEvents(src, {
    initialHtml: performance() + '<a href="/spielplan/?pg=2" class="pods-pagination-next">Weiter</a>',
    robotsFn: async (url) => { calls.push(['robots', url]); return true; },
    fetchImpl: async (url) => { calls.push(['fetch', url]); return { ok: true, text: async () => performance({ date: '20.09.2026', slugDate: '2026-09-20' }) }; },
  });
  assert.equal(events.length, 2);
  assert.deepEqual(calls, [['robots', `${src.url}?pg=2`], ['fetch', `${src.url}?pg=2`]]);
});

test('theatre crawl refuses robots-disallowed pagination before requesting it', async () => {
  await assert.rejects(fetchTheaterDesKindesEvents({ url: THEATER_DES_KINDES_SOURCE_URL }, {
    robotsFn: async () => false,
    fetchImpl: async () => assert.fail('must not fetch'),
  }), /robots disallows/);
});
