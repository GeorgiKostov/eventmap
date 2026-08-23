import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { eventSourceUrl, htmlToText, icsDateToZone } from '../scripts/crawl.mjs';

test('JSON-LD-only pages survive the thin-page/hash material step', () => {
  const page = (date) => `<html><body>Events</body><script type="application/ld+json">{"@type":"Event","name":"Family day","startDate":"${date}"}</script></html>`;
  const first = htmlToText(page('2026-09-01'));
  const second = htmlToText(page('2026-09-02'));
  assert.match(first, /Family day/);
  assert.notEqual(createHash('sha256').update(first).digest('hex'), createHash('sha256').update(second).digest('hex'));
});

test('UTC iCal instants convert through the source country timezone', () => {
  assert.deepEqual(icsDateToZone('20260823T120000Z', 'Europe/Vienna'), { date: '2026-08-23', time: '14:00' });
  assert.deepEqual(icsDateToZone('20260823T120000Z', 'Europe/Sofia'), { date: '2026-08-23', time: '15:00' });
});

test('crawl linkbacks resolve relative paths and reject mail/tel pseudo-links', () => {
  const source = 'https://example.org/events/';
  assert.equal(eventSourceUrl('detail/42', source), 'https://example.org/events/detail/42');
  assert.equal(eventSourceUrl('mailto:organizer@example.org', source), source);
  assert.equal(eventSourceUrl('tel:+431234', source), source);
});
