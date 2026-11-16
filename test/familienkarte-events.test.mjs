import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFamilienkarteEvents, fetchFamilienkarteEvents, familienkarteUrl } from '../lib/familienkarte-events.js';

const entry = (key, title, when, loc) => `<div class="redx-list-entry eventList">
  <div class="eventEntry" role="article">
    <div class="image"><a href="/de/x/action.view/entity.detail/key.${key}.html"><img src="https://a/b.jpg"></a></div>
    <div class="summary" id="e${key}">
      <strong>${title}</strong>
      ${when}
      ${loc}
    </div>
    <div class="details"><a href="/de/x/action.view/entity.detail/key.${key}.html">mehr Details</a></div>
  </div></div>`;
const page = (...e) => `<html>${e.join('\n')}</html>`;
const A = entry(1, 'Offene Tour &amp; mehr', 'am 14.11.2026<br />von 11:00 Uhr bis 12:30 Uhr<br />', '5230 Mattighofen');
const ALLDAY = entry(2, 'Biergarten', 'am 15.11.2026<br />von 00:00 Uhr bis 23:59 Uhr<br />', '4880 St. Georgen im Attergau');
const NODATE = entry(3, 'Ohne Datum', 'demnächst<br />', '4020 Linz');
const BADDATE = entry(4, 'Falsch', 'am 31.02.2026<br />', '4020 Linz');

test('parses entries, skips undated', () => {
  const ev = parseFamilienkarteEvents(page(A, ALLDAY, NODATE, BADDATE));
  assert.equal(ev.length, 2);
  assert.deepEqual(
    { t: ev[0].title, d: ev[0].date_start, ts: ev[0].time_start, te: ev[0].time_end, town: ev[0].town, desc: ev[0].description },
    { t: 'Offene Tour & mehr', d: '2026-11-14', ts: '11:00', te: '12:30', town: 'Mattighofen', desc: null },
  );
  assert.equal(ev[0].source_url, 'https://www.familienkarte.at/de/x/action.view/entity.detail/key.1.html');
  assert.deepEqual(ev[0].categories, ['family']);
  assert.equal(ev[1].time_start, null); // all-day placeholder
  assert.equal(ev[1].town, 'St. Georgen im Attergau');
});

test('full title from the detail link, past-dated entries skipped', () => {
  const cut = entry(5, 'Pfenningberg-Trails | Wochenend Fahrt...', 'am 20.11.2026<br />', '4221 Steyregg')
    .replace('<a href="/de/x/action.view/entity.detail/key.5.html">mehr', '<a href="/de/x/action.view/entity.detail/key.5.html" aria-label="mehr Details zu &quot;Pfenningberg-Trails | Wochenend Fahrtechnikkurs&quot;">mehr');
  const old = entry(6, 'Ausstellung', 'am 14.09.2026<br />', '4020 Linz');
  const ev = parseFamilienkarteEvents(page(cut, old), { from: '2026-11-16' });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Pfenningberg-Trails | Wochenend Fahrtechnikkurs');
});

test('always sends an explicit date window, walks pages, stops past the window', async () => {
  const base = 'https://www.familienkarte.at/de/k.html';
  const window = { from: '2026-11-14', to: '2026-11-30' };
  assert.equal(familienkarteUrl(base, 2, window), 'https://www.familienkarte.at/de/k/limitstart.50.html?date_from=2026-11-14&date_to=2026-11-30');
  const pages = {
    [familienkarteUrl(base, 0, window)]: page(A),
    [familienkarteUrl(base, 1, window)]: page(ALLDAY, entry(9, 'X', 'am 1.12.2026', '4020 Linz')),
  };
  const calls = [];
  const fetchImpl = async (u) => { calls.push(u); return { ok: true, text: async () => pages[u] ?? page() }; };
  const ev = await fetchFamilienkarteEvents({ url: base }, { fetchImpl, robotsFn: async () => true, window });
  assert.deepEqual(ev.map((e) => e.date_start), ['2026-11-14', '2026-11-15']); // 1 Dec is outside
  assert.equal(calls.length, 2); // page 2 never requested
});
