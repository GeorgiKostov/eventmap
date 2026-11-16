import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLandestheaterEvents, fetchLandestheaterEvents } from '../lib/landestheater-linz-events.js';

function row({ id = '1', time = '10:30 - 11:45 Uhr', title = 'Pinocchio | 6+', type = 'Junges Theater', info = "<span class='komponist'>X</span><br>\n Kammerspiele\n <br>" } = {}) {
  return `<div id="event-${id}" class="lth-evitem"><div class="lth-evitem-time">${time}</div>
    <div class="lth-evitem-what"><div class="lth-evitem-title"><a name="t">${title}</a></div>
    <div class="lth-evitem-type">${type}</div>
    <div class="lth-evitem-text">${info}<ltl-eventcast-info eventid="9"></ltl-eventcast-info></div></div></div>`;
}
const day = (label, rows) => `<section><div class="lth-section-title"><div class="lth-evitem-date">Dienstag, <span class="lth-book">${label}</span></div></div>${rows}</section>`;

test('parses day headings, slots, stage, Sparte and the age suffix', () => {
  const [ev] = parseLandestheaterEvents(day('17. November 2026', row()));
  assert.equal(ev.title, 'Pinocchio');
  assert.equal(ev.date_start, '2026-11-17');
  assert.equal(ev.time_start, '10:30');
  assert.equal(ev.time_end, '11:45');
  assert.equal(ev.venue, 'Kammerspiele');
  assert.equal(ev.address, 'Promenade 39, 4020 Linz');
  assert.equal(ev.age_min, 6);
  assert.ok(ev.categories.includes('family'));
  assert.equal(ev.description, null);
  assert.equal(ev.source_url, 'https://www.landestheater-linz.at/termine#event-1');
});

test('skips closed performances and handles Jänner / unnamed stages', () => {
  const html = day('05. J&auml;nner 2027', row({ id: '2', info: 'Großer Saal Musiktheater<br>Geschlossene Vorstellung' })
    + row({ id: '3', title: 'Hamlet', type: 'Schauspiel', info: '<br>Buchungsanfragen Schulen' }));
  const events = parseLandestheaterEvents(html);
  assert.equal(events.length, 1);
  assert.equal(events[0].date_start, '2027-01-05');
  assert.equal(events[0].venue, 'Landestheater Linz');
  assert.deepEqual(events[0].categories, ['culture']);
});

test('drops impossible dates and rows before any day heading', () => {
  assert.deepEqual(parseLandestheaterEvents(day('31. Februar 2027', row())), []);
  assert.deepEqual(parseLandestheaterEvents(row()), []);
});

test('follows the list widget by POSTing cal= until the 8-week horizon, with robots checks', async () => {
  const calls = [];
  const first = day('17. November 2026', row({ id: '1' })) + day('20. November 2026', row({ id: '2', title: 'Eins' }));
  const second = day('20. November 2026', row({ id: '2', title: 'Eins' })) + day('20. Jänner 2027', row({ id: '3', title: 'Zwei' }));
  const events = await fetchLandestheaterEvents({ url: 'https://www.landestheater-linz.at/termine', town: 'Linz' }, {
    shellHtml: first,
    robotsFn: async (url) => { calls.push(['robots', url]); return true; },
    fetchImpl: async (url, opts) => { calls.push(['fetch', url, opts.method, opts.body]); return { ok: true, text: async () => second }; },
  });
  assert.deepEqual(events.map((e) => e.date_start), ['2026-11-17', '2026-11-20', '2027-01-20']);
  const posts = calls.filter((c) => c[0] === 'fetch');
  assert.equal(posts.length, 1);
  assert.equal(posts[0][1], 'https://www.landestheater-linz.at/DE/repos/evoscripts/lth/getEvents');
  assert.equal(posts[0][2], 'POST');
  assert.equal(posts[0][3], 'cal=20.11.2026');
});

test('returns nothing when robots disallow the listing', async () => {
  assert.deepEqual(await fetchLandestheaterEvents({ url: 'https://www.landestheater-linz.at/termine' }, {
    shellHtml: day('17. November 2026', row()), robotsFn: async () => false,
  }), []);
});
