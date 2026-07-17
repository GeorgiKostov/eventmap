import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFamilienportalCard } from '../lib/familienportal-events.js';

const SRC = { url: 'https://familienportal.berlin.de/veranstaltungen', town: 'Berlin' };
const card = (h3, meta, href) => `
<article class="modul-teaser" data-add-clickable-area="smart">
  <div class="image"><img src="x.png"></div>
  <h3 class="title">${h3}</h3>
  <div class="teaser__meta"><p class="text--meta">${meta}</p></div>
  <div class="inner"><p class="text">Portal-Prosa, die NICHT kopiert werden darf.</p>
  ${href ? `<a class="more" href="${href}">Mehr</a>` : ''}</div>
</article>`;

test('parses date | time | Bezirk — keeps the real time, Bezirk as town, no venue', () => {
  const ev = parseFamilienportalCard(
    card('Rätselabenteuer', '17.07.2026  |  10:00  Uhr  |  Pankow', '/veranstaltungen-3/termin/raetsel-20260717-8'),
    SRC, SRC.url,
  );
  assert.equal(ev.title, 'Rätselabenteuer');
  assert.equal(ev.date_start, '2026-07-17');
  assert.equal(ev.time_start, '10:00');        // the real time, NOT dropped
  assert.equal(ev.starts_at, '2026-07-17T10:00');
  assert.equal(ev.venue, null);                // never a venue from the listing
  assert.equal(ev.town, 'Pankow, Berlin');     // Bezirk precision
  assert.equal(ev.source_url, 'https://familienportal.berlin.de/veranstaltungen-3/termin/raetsel-20260717-8');
  assert.equal(ev.description, null);
});

test('the time field is NEVER mistaken for a venue (the twin-fabrication bug)', () => {
  const ev = parseFamilienportalCard(card('X', '17.07.2026 | 09:30 Uhr | Mitte'), SRC, SRC.url);
  assert.equal(ev.time_start, '09:30');
  assert.equal(ev.venue, null);
  assert.notEqual(ev.town.split(',')[0], '09:30 Uhr'); // no "09:30 Uhr" as a place
});

test('two-field card (date | Bezirk, no time) → date-only, Bezirk town', () => {
  const ev = parseFamilienportalCard(card('X', '18.07.2026 | Treptow-Köpenick'), SRC, SRC.url);
  assert.equal(ev.date_start, '2026-07-18');
  assert.equal(ev.time_start, null);           // no time published → not invented
  assert.equal(ev.starts_at, '2026-07-18');    // date-only
  assert.equal(ev.town, 'Treptow-Köpenick, Berlin');
});

test('citywide sentinels are not places → fall back to the bare city', () => {
  for (const s of ['Berlinweit', 'Berliner-Umland', 'Online']) {
    const ev = parseFamilienportalCard(card('X', `19.07.2026 | 11:00 Uhr | ${s}`), SRC, SRC.url);
    assert.equal(ev.town, 'Berlin', `${s} should drop to Berlin`);
    assert.equal(ev.time_start, '11:00');
  }
});

test('a card with no date is skipped, never guessed', () => {
  assert.equal(parseFamilienportalCard(card('Irgendwann', 'Berlinweit'), SRC, SRC.url), null);
});

test('description is never populated from the portal teaser prose', () => {
  const ev = parseFamilienportalCard(card('Fest', '20.07.2026 | 14:00 Uhr | Spandau'), SRC, SRC.url);
  assert.equal(ev.description, null);
});

test('town falls back to the source row town when the source is not Berlin', () => {
  const ev = parseFamilienportalCard(card('X', '21.07.2026 | Potsdam-Mittelmark'), { url: SRC.url, town: 'Potsdam' }, SRC.url);
  assert.equal(ev.town, 'Potsdam-Mittelmark, Potsdam');
});
