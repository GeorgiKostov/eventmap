import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWissensturmEvents } from '../lib/wissensturm-events.js';

function card({ title = 'Klangsalabim', dates = '15.09.2026', time = '16:00', venue = 'Stadtbibliothek Urfahr', extra = 'Für Kinder ab 4 Jahren.' } = {}) {
  return `<article><a href="https://vhskurs.linz.at/index.php?kathaupt=11&amp;knr=26.1"><h2>${title}</h2>
    <span>Termin:</span> ${dates}<span>Uhrzeit :</span> ${time} Uhr
    <span>Veranstaltungsort:</span> <span translate="no">${venue}</span><p>${extra}</p></a></article>`;
}

test('library cards preserve Vienna dates, branch venue, factual ages and linkbacks', () => {
  const [event] = parseWissensturmEvents('kostenloses Veranstaltungsprogramm' + card());
  assert.equal(event.title, 'Klangsalabim');
  assert.equal(event.date_start, '2026-09-15');
  assert.equal(event.time_start, '16:00');
  assert.equal(event.venue, 'Stadtbibliothek Urfahr');
  assert.equal(event.address, null);
  assert.equal(event.age_min, 4);
  assert.equal(event.is_free, true);
  assert.equal(event.description, null);
  assert.equal(event.source_url, 'https://vhskurs.linz.at/index.php?kathaupt=11&knr=26.1');
  assert.deepEqual(event.categories, ['culture', 'family']);
});

test('library ranges retain date-only ends and do not manufacture a time', () => {
  const [event] = parseWissensturmEvents(card({ title: 'Flohmarkt', dates: '21.09.2026 bis 26.09.2026', time: '', venue: 'Stadtbibliothek Wissensturm, EG', extra: '' }));
  assert.equal(event.date_end, '2026-09-26');
  assert.equal(event.time_start, null);
  assert.equal(event.address, 'Kärntnerstraße 26, 4020 Linz');
  assert.equal(event.is_free, null);
  assert.deepEqual(event.categories, ['market']);
});

test('library parser skips invalid or missing dates and backwards ranges', () => {
  for (const dates of ['31.02.2026', '', '21.09.2026 bis 20.09.2026']) {
    assert.deepEqual(parseWissensturmEvents(card({ dates })), []);
  }
});
