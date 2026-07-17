import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonLdEvents } from '../lib/jsonld-events.js';
import { twoHopConfig } from '../lib/twohop-events.js';

// A detail page shaped like visitberlin's: the Event sits inside @graph, and the
// top-level @type is null — the exact case a naive top-level check misses.
const detail = (name, start, end, loc) => `<html><head>
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'WebPage', '@id': 'x' },
  { '@type': 'Event', name, startDate: start, endDate: end, url: 'https://www.visitberlin.de/de/event/x',
    location: { '@type': 'Place', name: loc } },
] })}
</script></head><body>…</body></html>`;

test('parseJsonLdEvents finds an Event nested in @graph (top-level @type null)', () => {
  const [ev] = parseJsonLdEvents(detail('FEZitty', '2026-07-14T10:00:00', '2026-08-21T16:30:00', 'FEZ Wuhlheide'), { town: 'Berlin' });
  assert.equal(ev.title, 'FEZitty');
  assert.equal(ev.date_start, '2026-07-14');
  assert.equal(ev.time_start, '10:00');
  assert.equal(ev.date_end, '2026-08-21');
  assert.equal(ev.venue, 'FEZ Wuhlheide');
  assert.equal(ev.town, 'Berlin');
  assert.equal(ev.description, null); // never copied
});

test('a detail page with no Event JSON-LD yields nothing (no fabrication)', () => {
  assert.deepEqual(parseJsonLdEvents('<html><body><p>Keine Termine</p></body></html>', { town: 'Berlin' }), []);
  const noDate = '<script type="application/ld+json">{"@type":"Event","name":"Undatiert"}</script>';
  assert.deepEqual(parseJsonLdEvents(noDate, { town: 'Berlin' }), []); // no startDate → skip
});

test('twoHopConfig resolves the German visitberlin listing, trailing slash tolerant', () => {
  assert.ok(twoHopConfig('https://www.visitberlin.de/de/kategorie/familie'));
  assert.ok(twoHopConfig('https://www.visitberlin.de/de/kategorie/familie/'));
  assert.equal(twoHopConfig('https://www.visitberlin.de/en/category/family'), null); // English retired
  assert.equal(twoHopConfig('https://example.com/events'), null); // unconfigured → no guess
});
