import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMicrodataEvents } from '../lib/microdata-events.js';

const SRC = { url: 'https://www.muenchen.de/veranstaltungen/event/familie-kinder', town: 'München' };

// Shape taken verbatim from muenchen.de (fetched 2026-07-17): the itemprop
// startDate is a noon-UTC date marker, the real time sits in a plain <time>.
const muc = (start, end, name, href, loc) => `
<div class="m-event-list-item" itemprop="event" itemscope="" itemtype="https://schema.org/Event">
  <time class="m-date-range__item" itemprop="startDate" datetime="${start}"><span>17</span><span>Juli</span></time>
  <time class="m-date-range__item" itemprop="endDate" datetime="${end}"><span>23</span><span>Aug.</span></time>
  <h3 class="m-event-list-item__headline" itemprop="name">
    <a itemprop="url" href="${href}"><span>${name}</span></a>
  </h3>
  <p class="m-event-list-item__detail"><time datetime="17.07.2026 - 09:00:00">Fr. 17.07.2026 09:00</time></p>
  <p class="m-event-list-item__location" itemprop="location">${loc}</p>
</div>`;

const PAGE = `<html><body><ul>
${muc('2026-07-17T12:00:00Z', '2026-08-23T12:00:00Z', '„Succu… was?“ Die Welt der Sukkulenten', '/veranstaltungen/detail/succu', 'Botanischer Garten')}
${muc('2026-07-18T12:00:00Z', '2026-07-18T12:00:00Z', 'Flugwerft Schleißheim', '/veranstaltungen/detail/flugwerft', 'Deutsches Museum - Flugwerft Schleißheim')}
${muc('2026-07-19T12:00:00Z', '2026-07-19T12:00:00Z', 'Mensch und Natur', '/veranstaltungen/detail/mensch', 'Museum Mensch und Natur')}
</ul></body></html>`;

test('parses schema.org/Event microdata into event facts with an absolute linkback', () => {
  const events = parseMicrodataEvents(PAGE, SRC);
  assert.equal(events.length, 3);
  assert.deepEqual(events[0], {
    title: '„Succu… was?“ Die Welt der Sukkulenten',
    date_start: '2026-07-17', time_start: null,
    date_end: '2026-08-23', time_end: null,
    venue: 'Botanischer Garten', address: null, town: 'München',
    categories: [], is_free: null, age_min: null, age_max: null, indoor: null,
    description: null,
    source_url: 'https://www.muenchen.de/veranstaltungen/detail/succu',
  });
});

test('a noon-UTC marker shared by every event is dropped, never stored as a start time', () => {
  // The muenchen.de bug: 100/100 events publish T12:00:00Z while their visible
  // markup shows 11 distinct clock times. Storing 12:00 would fabricate.
  for (const ev of parseMicrodataEvents(PAGE, SRC)) {
    assert.equal(ev.time_start, null);
    assert.equal(ev.time_end, null);
    assert.match(ev.date_start, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('midnight markers are dropped too', () => {
  const midnight = PAGE.replace(/T12:00:00Z/g, 'T00:00:00');
  assert.equal(parseMicrodataEvents(midnight, SRC)[0].time_start, null);
});

test('REAL uniform times are KEPT — dropping a published fact is the twin bug', () => {
  // A theatre whose every show starts 19:30 must not lose 19:30: only the
  // canonical date-only markers (midnight/noon) count as serialization noise.
  const theatre = PAGE.replace(/T12:00:00Z/g, 'T19:30:00');
  const events = parseMicrodataEvents(theatre, SRC);
  assert.equal(events.length, 3);
  for (const ev of events) assert.equal(ev.time_start, '19:30');
});

test('a genuine mix of times is kept as published', () => {
  const mixed = PAGE
    .replace('2026-07-17T12:00:00Z', '2026-07-17T09:00:00')
    .replace('2026-07-18T12:00:00Z', '2026-07-18T17:00:00')
    .replace('2026-07-19T12:00:00Z', '2026-07-19T18:30:00');
  assert.deepEqual(parseMicrodataEvents(mixed, SRC).map((e) => e.time_start), ['09:00', '17:00', '18:30']);
});

test('an event without a date is skipped rather than guessed at', () => {
  const undated = `<div itemscope itemtype="https://schema.org/Event">
    <span itemprop="name">Irgendwann mal</span></div>`;
  assert.deepEqual(parseMicrodataEvents(undated, SRC), []);
});

test('a nested Place itemscope does not shadow the event name or leak its address', () => {
  const nested = `<div itemscope itemtype="https://schema.org/Event">
    <meta itemprop="startDate" content="2026-09-01T20:00">
    <h2 itemprop="name">Konzert im Park</h2>
    <div itemprop="location" itemscope itemtype="https://schema.org/Place">
      <span itemprop="name">Gasteig HP8</span>
      <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
        <span itemprop="streetAddress">Hans-Preißinger-Str. 8</span>
        <span itemprop="addressLocality">München</span>
      </div>
    </div></div>`;
  const [ev] = parseMicrodataEvents(nested, SRC);
  assert.equal(ev.title, 'Konzert im Park');
  assert.equal(ev.venue, 'Gasteig HP8');
  assert.equal(ev.address, 'Hans-Preißinger-Str. 8');
  assert.equal(ev.town, 'München');
  assert.equal(ev.time_start, '20:00'); // single event -> no uniformity evidence -> keep
});

test('itemtype maps to a category, and free offers are detected', () => {
  const free = `<div itemscope itemtype="https://schema.org/ChildrensEvent">
    <meta itemprop="startDate" content="2026-09-01">
    <span itemprop="name">Kasperltheater</span>
    <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <meta itemprop="price" content="0"></div></div>`;
  const [ev] = parseMicrodataEvents(free, SRC);
  assert.deepEqual(ev.categories, ['family']);
  assert.equal(ev.is_free, true);
});

test('a page with no microdata yields nothing (waterfall falls through)', () => {
  assert.deepEqual(parseMicrodataEvents('<html><body><p>Keine Termine</p></body></html>', SRC), []);
  assert.deepEqual(parseMicrodataEvents('', SRC), []);
});

test('description is never populated from source prose', () => {
  const withProse = `<div itemscope itemtype="https://schema.org/Event">
    <meta itemprop="startDate" content="2026-09-01">
    <span itemprop="name">Fest</span>
    <p itemprop="description">Ein wunderbares Fest fuer die ganze Familie.</p></div>`;
  assert.equal(parseMicrodataEvents(withProse, SRC)[0].description, null);
});
