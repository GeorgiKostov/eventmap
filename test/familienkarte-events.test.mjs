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

test('pagination url and stop when a page adds nothing new', async () => {
  const base = 'https://www.familienkarte.at/de/k.html';
  assert.equal(familienkarteUrl(base, 2), 'https://www.familienkarte.at/de/k/limitstart.50.html');
  const pages = { [familienkarteUrl(base, 1)]: page(ALLDAY), [familienkarteUrl(base, 2)]: page(ALLDAY), [familienkarteUrl(base, 3)]: page(entry(9, 'X', 'am 1.12.2026', '4020 Linz')) };
  const calls = [];
  const fetchImpl = async (u) => { calls.push(u); return { ok: true, text: async () => pages[u] ?? page() }; };
  const ev = await fetchFamilienkarteEvents({ url: base }, { shellHtml: page(A), fetchImpl, robotsFn: async () => true });
  assert.equal(ev.length, 2);
  assert.equal(calls.length, 2); // page 3 never requested
});
