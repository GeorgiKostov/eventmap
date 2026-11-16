import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAlpenvereinLinzEvents, fetchAlpenvereinLinzEvents } from '../lib/alpenverein-linz-events.js';

const ID = 'b2505452-cd69-4809-9cb8-d77e8268985b';
const entry = ({ id = ID, title = 'Kletterkurs Kinder 7-9 Jahre', when = '05.10.2026 17:00 - 30.04.2027 18:00', ort = 'Kletterhalle' } = {}) => `
<ul><li class="listEntry listEntryClickable" onclick="wOpenURL('/linz/02_programm/office-details-Online.php?veranstaltungID=${id}&oa=1')">
  <div class="listEntrySubline"><a href="/linz/02_programm/office-details-Online.php?veranstaltungID=${id}&oa=1">${title}</a></div>
  <div class="listEntrySubline" id="officeveranstaltung_ort_x_${id}"><strong>${ort}&#160;</strong></div>
  <div class="listEntrySubline" style="margin:0px;">
    ${when}
  </div>
</li></ul>`;

test('emits a series with start and end as given, a stable detail link, venue and age range', () => {
  const [ev] = parseAlpenvereinLinzEvents(entry());
  assert.equal(ev.date_start, '2026-10-05');
  assert.equal(ev.time_start, '17:00');
  assert.equal(ev.date_end, '2027-04-30');
  assert.equal(ev.time_end, '18:00');
  assert.equal(ev.venue, 'Kletterhalle');
  assert.equal(ev.age_min, 7);
  assert.equal(ev.age_max, 9);
  assert.equal(ev.town, 'Linz');
  assert.ok(ev.categories.includes('family') && ev.categories.includes('sport'));
  assert.equal(ev.source_url, `https://www.alpenverein.at/linz/02_programm/office-details-Online.php?veranstaltungID=${ID}`);
});

test('handles date-only, date-range-only and same-day slots; drops duplicates and bad dates', () => {
  const html = entry({ when: '28.11.2026' })
    + entry({ id: 'aaaaaaaa-cd69-4809-9cb8-d77e8268985b', when: '02.01.2027  - 05.01.2027 ' })
    + entry({ id: 'bbbbbbbb-cd69-4809-9cb8-d77e8268985b', when: '20.11.2026 18:15 - 20.11.2026 21:15' })
    + entry({ id: 'cccccccc-cd69-4809-9cb8-d77e8268985b', when: '31.02.2026 10:00' })
    + entry({ when: '28.11.2026' });
  const events = parseAlpenvereinLinzEvents(html);
  assert.equal(events.length, 3);
  assert.equal(events[0].time_start, null);
  assert.equal(events[0].date_end, null);
  assert.equal(events[1].date_end, '2027-01-05');
  assert.equal(events[2].date_end, null);
  assert.equal(events[2].time_end, '21:15');
});

test('fetch honours robots', async () => {
  const opts = { shellHtml: entry(), robotsFn: async () => false };
  assert.deepEqual(await fetchAlpenvereinLinzEvents({ url: 'https://www.alpenverein.at/linz/jugend/index.php' }, opts), []);
  assert.equal((await fetchAlpenvereinLinzEvents({ url: 'https://www.alpenverein.at/linz/jugend/index.php' }, { ...opts, robotsFn: async () => true })).length, 1);
});
