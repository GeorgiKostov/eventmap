import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTreibhausEvents, fetchTreibhausEvents, TREIBHAUS_SOURCE_URL } from '../lib/treibhaus-events.js';

function card({ id = '14655', date = '2026-10-11', time = '16:00', title = 'HERBERT &amp; MIMI: GLATT VERKEHRT. FÜR MENSCHEN AB 3', summary = '', host = 'https://treibhaus.at' } = {}) {
  return `<div id="event-${id}" class="event-item" itemscope itemtype="http://schema.org/Event">
    <div class="item-preview"><aside><a href="${host}/programm/${date.replaceAll('-', '/')}/${id}-show" itemprop="url">
    <span itemprop="startDate" content="${date}T${time}:00">${date} ${time} UHR</span></a></aside>
    <div class="content"><h1><span itemprop="name">${title}</span></h1>
    <div class="share-sub"><p>${summary}</p></div></div></div>
    <div id="event-details-${id}" style="display:none"></div></div>`;
}

test('uses local microdata and exact links, without invented duration or source prose', () => {
  const [event] = parseTreibhausEvents(card({ summary: 'Original publisher prose.' }));
  assert.equal(event.date_start, '2026-10-11');
  assert.equal(event.time_start, '16:00');
  assert.equal(event.source_url, 'https://treibhaus.at/programm/2026/10/11/14655-show');
  assert.equal(event.title, 'HERBERT & MIMI: GLATT VERKEHRT. FÜR MENSCHEN AB 3');
  assert.equal(event.age_min, 3);
  assert.ok(event.categories.includes('family'));
  assert.equal(event.description, null);
  assert.equal(event.date_end, null);
  assert.equal(event.time_end, null);
  assert.equal(event.is_free, null);
});

test('rejects offsite events, invalid dates, missing dates and foreign links; deduplicates', () => {
  const html = card() + card() + card({ id: '14734', title: 'JOSEF HADER IM CONGRESS - SAAL TIROL' })
    + card({ date: '2026-02-30' }) + card({ host: 'https://unrelated.example' })
    + card({ id: '9' }).replace('itemprop="startDate"', 'itemprop="datePublished"');
  assert.equal(parseTreibhausEvents(html).length, 1);
});

test('handles winter starts directly and preserves unknown age/free status', () => {
  const [event] = parseTreibhausEvents(card({ date: '2026-11-08', title: 'JAZZ KONZERT', summary: 'FREI:WILLIG' }));
  assert.equal(event.time_start, '16:00');
  assert.equal(event.age_min, null);
  assert.equal(event.is_free, null);
  assert.deepEqual(event.categories, ['music']);
});

test('respects robots, reuses shell HTML and reports transport failure', async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; return { ok: true, text: async () => card() }; };
  assert.deepEqual(await fetchTreibhausEvents(undefined, { robotsFn: async () => false, fetchImpl }), []);
  assert.equal(requests, 0);
  const robotsFn = async (url) => { assert.equal(url, TREIBHAUS_SOURCE_URL); return true; };
  assert.equal((await fetchTreibhausEvents(undefined, { robotsFn, shellHtml: card(), fetchImpl })).length, 1);
  assert.equal(requests, 0);
  assert.equal((await fetchTreibhausEvents(undefined, { robotsFn, fetchImpl })).length, 1);
  await assert.rejects(fetchTreibhausEvents(undefined, { robotsFn, fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
});
