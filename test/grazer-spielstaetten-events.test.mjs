import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchGrazerSpielstaettenEvents,
  parseGrazerSpielstaettenEntry,
} from '../lib/grazer-spielstaetten-events.js';

const SRC = { url: 'https://spielstaetten.buehnen-graz.com/', town: 'Graz' };

function entry(overrides = {}) {
  return {
    eventId: '182431860',
    date: '2026-08-21 21:00:00',
    location: 'KASEMATTEN',
    title: 'Candlelight Open Air: Queen & Abba',
    genre: 'Konzerte',
    canceled: '0',
    privateEvent: '0',
    ...overrides,
  };
}

test('maps the schedule API entry to local event facts and an official detail link', () => {
  assert.deepEqual(parseGrazerSpielstaettenEntry(entry(), SRC), {
    title: 'Candlelight Open Air: Queen & Abba',
    date_start: '2026-08-21',
    time_start: '21:00',
    date_end: null,
    time_end: null,
    venue: 'KASEMATTEN',
    address: null,
    town: 'Graz',
    categories: ['music'],
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    description: null,
    source_url: 'https://spielstaetten.buehnen-graz.com/event/182431860/',
  });
});

test('maps multiple genres without copying prose or inventing price/age facts', () => {
  const event = parseGrazerSpielstaettenEntry(entry({
    eventId: '2', title: 'Kinderkonzert', genre: 'Konzerte / Kinder & Jugend',
  }), SRC);
  assert.deepEqual(event.categories, ['music', 'family']);
  assert.equal(event.description, null);
  assert.equal(event.is_free, null);
  assert.equal(event.age_min, null);
});

test('skips canceled, private, undated, untitled, and unlinked entries', () => {
  assert.equal(parseGrazerSpielstaettenEntry(entry({ canceled: '1' }), SRC), null);
  assert.equal(parseGrazerSpielstaettenEntry(entry({ privateEvent: true }), SRC), null);
  assert.equal(parseGrazerSpielstaettenEntry(entry({ date: 'not-a-date' }), SRC), null);
  assert.equal(parseGrazerSpielstaettenEntry(entry({ title: '' }), SRC), null);
  assert.equal(parseGrazerSpielstaettenEntry(entry({ eventId: null }), SRC), null);
});

test('paginates by returned entry count, deduplicates ids, and stops at a short page', async () => {
  const calls = [];
  const firstPage = [entry({ eventId: '1', title: 'One' }), entry({ eventId: '2', title: 'Two' })];
  for (let i = 3; i <= 20; i++) firstPage.push(entry({ eventId: String(i), title: `Event ${i}` }));
  const pages = new Map([
    [0, firstPage],
    [20, [entry({ eventId: '2', title: 'Two' }), entry({ eventId: '21', title: 'Twenty-one' })]],
  ]);
  const events = await fetchGrazerSpielstaettenEvents(SRC, {
    robotsCheck: async () => true,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.entryCount);
      const rows = pages.get(body.entryCount) || [];
      return { ok: true, json: async () => ({ entries: rows }) };
    },
  });

  assert.deepEqual(calls, [0, 20]);
  assert.equal(events.length, 21);
  assert.deepEqual(events.slice(0, 3).map((event) => event.title), ['One', 'Two', 'Event 3']);
  assert.equal(events.at(-1).title, 'Twenty-one');
});

test('returns safely on robots, HTTP, JSON, and page-cap failures', async () => {
  let calls = 0;
  assert.deepEqual(await fetchGrazerSpielstaettenEvents(SRC, {
    robotsCheck: async () => false,
    fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ entries: [] }) }; },
  }), []);
  assert.equal(calls, 0);

  assert.deepEqual(await fetchGrazerSpielstaettenEvents(SRC, {
    robotsCheck: async () => true,
    fetchImpl: async () => ({ ok: false }),
  }), []);

  assert.deepEqual(await fetchGrazerSpielstaettenEvents(SRC, {
    robotsCheck: async () => true,
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }),
  }), []);

  let pageCalls = 0;
  const capped = await fetchGrazerSpielstaettenEvents(SRC, {
    robotsCheck: async () => true,
    maxPages: 2,
    fetchImpl: async (_url, options) => {
      pageCalls++;
      const body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ entries: Array.from({ length: 20 }, (_, i) => entry({
          eventId: String(body.entryCount + i + 1), title: `Event ${body.entryCount + i + 1}`,
        })) }),
      };
    },
  });
  assert.equal(pageCalls, 2);
  assert.equal(capped.length, 40);
});
