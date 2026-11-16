import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonLdEvents } from '../lib/jsonld-events.js';

const page = (...nodes) => nodes.map((n) => `<script type="application/ld+json">${JSON.stringify(n)}</script>`).join('');
const ev = (name, startDate, endDate) => ({ '@type': 'Event', name, startDate, endDate, url: 'https://x.test/e' });

test('a time stated in the title wins over a shifted startDate', () => {
  const [e] = parseJsonLdEvents(page(ev('Highlightführung 11:00', '2026-11-21T12:00:00+01:00', '2026-11-21T13:00:00+01:00')), { url: 'https://x.test/' });
  assert.equal(e.time_start, '11:00');
  assert.equal(e.time_end, '12:00');
  assert.equal(e.date_start, '2026-11-21');
});

test('titles without exactly one time keep startDate', () => {
  const [a, b, c] = parseJsonLdEvents(page(
    ev('Konzert', '2026-11-21T19:30:00+01:00'),
    ev('Doppelvorstellung 15:00 und 18:00', '2026-11-21T15:00:00+01:00'),
    ev('Lesung 19:30', '2026-11-21T19:30:00+01:00'),
  ), { url: 'https://x.test/' });
  assert.equal(a.time_start, '19:30');
  assert.equal(b.time_start, '15:00');
  assert.equal(c.time_start, '19:30');
});
