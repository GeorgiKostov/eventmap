import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLandesbibliothekEvents, fetchLandesbibliothekEvents, LANDESBIBLIOTHEK_SOURCE_URL } from '../lib/landesbibliothek-events.js';

const item = ({ date = '20.11.26', when = 'Fr, 15:00 Uhr', label = 'Führungen', title = 'Guided Tour', slug = 'guided-tour' } = {}) => `
<div class="row news-list-item"><div class="col-md-3"><div><span class="date">${date}</span> <br/> <em> ${when} </em></div></div>
<div class="col-md-9"><p class="text-primary text-uppercase"><a href="/veranstaltungen/detail/${slug}">${label}</a></p>
<p class="mb-0 strong" itemprop="headline"> ${title} </p><div itemprop="description"><p>Prosa die wir nicht lesen</p></div></div></div>`;

test('parses short dates, weekday times, headline and the detail link', () => {
  const [ev] = parseLandesbibliothekEvents(item());
  assert.equal(ev.title, 'Guided Tour');
  assert.equal(ev.date_start, '2026-11-20');
  assert.equal(ev.time_start, '15:00');
  assert.equal(ev.venue, 'OÖ Landesbibliothek');
  assert.equal(ev.town, 'Linz');
  assert.equal(ev.description, null);
  assert.equal(ev.source_url, 'https://www.landesbibliothek.at/veranstaltungen/detail/guided-tour');
});

test('a status label such as Ausgebucht is not treated as a category; kids and bad dates handled', () => {
  const events = parseLandesbibliothekEvents(
    item({ label: 'Ausgebucht', slug: 'a' }) + item({ title: 'Kinder-Lesung', slug: 'b' }) + item({ date: '31.02.27', slug: 'c' }) + item({ when: 'Fr', slug: 'd' }),
  );
  assert.equal(events.length, 3);
  assert.deepEqual(events[0].categories, ['culture']);
  assert.ok(events[1].categories.includes('family'));
  assert.equal(events[2].time_start, null);
});

test('follows the next-page link on the same site with robots checks and de-duplicates', async () => {
  const calls = [];
  const nav = '<ul><li class="page-item next"><a href="/veranstaltungen/seite-2" class="page-link">nächste</a></li></ul>';
  const events = await fetchLandesbibliothekEvents({ url: LANDESBIBLIOTHEK_SOURCE_URL }, {
    shellHtml: nav + item({ slug: 'a' }),
    robotsFn: async (url) => { calls.push(url); return true; },
    fetchImpl: async (url) => ({ ok: true, text: async () => item({ slug: 'a' }) + item({ date: '27.02.27', slug: 'z' }) }),
  });
  assert.deepEqual(events.map((e) => e.date_start), ['2026-11-20', '2027-02-27']);
  assert.ok(calls.includes('https://www.landesbibliothek.at/veranstaltungen/seite-2'));
});
