import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchNiedermairEvents, parseNiedermairEvents } from '../lib/niedermair-events.js';

const source = 'https://niedermair.at/spielplan';
const listing = `${source}/09/2026`;
function programme({ date = '2026-09-08', time = '19:30', title = 'Jimmy Schlager: Lästerlieder', day = '08', notice = '' } = {}) {
  return `<a class="eventrow soldout"><span class="day">${day}</span><span class="month">SEP</span>
    <span class="date">Dienstag, ${time}</span><strong class="artistname">${title}</strong>
    <span class="additionalText">${notice}</span><div class="rowDetails">Do not copy this prose.</div></a>
    <script type="application/ld+json">${JSON.stringify({ '@graph': [{
      '@type': 'Event', name: title.replace(':', ''), startDate: `${date}T${time}:00+02:00`,
      offers: { url: 'https://niedermair.at' }, description: 'Do not copy this either.',
    }] })}</script>`;
}
const navigation = [9, 10, 11, 12].map((month) => `<a href="/spielplan/${String(month).padStart(2, '0')}/2026">month</a>`).join('');

test('corroborates visible date/time/title, preserves local time and uses the fetched listing', () => {
  const [event] = parseNiedermairEvents(programme(), { url: listing });
  assert.equal(event.title, 'Jimmy Schlager: Lästerlieder');
  assert.equal(event.date_start, '2026-09-08');
  assert.equal(event.time_start, '19:30');
  assert.equal(event.source_url, listing);
  assert.equal(event.venue, 'Kabarett Niedermair');
  assert.equal(event.address, 'Lenaugasse 1A, 1080 Wien');
  assert.equal(event.description, null);
  assert.equal(event.is_free, null);
  assert.equal(event.age_min, null);
  assert.deepEqual(event.categories, ['culture']);
});

test('rejects contradictory, impossible or cancelled dates and skips duplicate JSON-LD', () => {
  for (const html of [programme({ day: '09' }), programme({ date: '2026-09-31', day: '31' }),
    programme({ date: '2027-09-08' }), programme({ notice: 'Leider abgesagt!' }),
    programme().replace('Dienstag, 19:30', 'Dienstag, 18:30')]) {
    assert.deepEqual(parseNiedermairEvents(html, { url: listing }), []);
  }
  assert.equal(parseNiedermairEvents(programme() + programme(), { url: listing }).length, 1);
});

test('children classification comes from the dedicated programme, not prose', () => {
  const [event] = parseNiedermairEvents(programme(), { url: 'https://niedermair.at/kindertheater/09/2026' });
  assert.deepEqual(event.categories, ['culture', 'family']);
  assert.equal(event.age_max, null);
});

test('fetches only the three discoverable Vienna months, reuses shell and honours robots', async () => {
  const calls = [];
  const robotChecks = [];
  const events = await fetchNiedermairEvents({ url: source }, {
    shellHtml: navigation,
    now: new Date('2026-08-31T22:30:00Z'), // September in Vienna.
    robotsFn: async (url) => { robotChecks.push(url); return !url.includes('/10/2026'); },
    fetchImpl: async (url) => { calls.push(url); return { ok: true, text: async () => url === listing ? programme() : '' }; },
  });
  assert.deepEqual(calls, [listing, `${source}/11/2026`]);
  assert.ok(robotChecks.includes(`${source}/10/2026`));
  assert.equal(events.length, 1);
});

test('does not invent unlinked months and propagates HTTP and transport errors', async () => {
  const options = { now: new Date('2026-09-05T12:00:00Z'), robotsFn: async () => true };
  const calls = [];
  await fetchNiedermairEvents({ url: source }, { ...options, shellHtml: '<a href="/spielplan/09/2026">Sep</a>',
    fetchImpl: async (url) => { calls.push(url); return { ok: true, text: async () => '' }; },
  });
  assert.deepEqual(calls, [listing]);
  await assert.rejects(fetchNiedermairEvents({ url: source }, { ...options, shellHtml: navigation,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }), /HTTP 503/);
  await assert.rejects(fetchNiedermairEvents({ url: source }, { ...options,
    fetchImpl: async () => { throw new Error('network unavailable'); },
  }), /network unavailable/);
  await assert.rejects(fetchNiedermairEvents({ url: source }, { ...options, shellHtml: '<html>maintenance</html>' }), /navigation missing/);
});
