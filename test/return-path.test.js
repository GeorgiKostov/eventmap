import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiscoveryReturn, safeWeekendReturn } from '../lib/return-path.js';

test('accepts only a dated Okolo weekend permalink', () => {
  assert.equal(
    safeWeekendReturn('/weekend/linz/2026-08-14'),
    '/weekend/linz/2026-08-14',
  );
  assert.equal(
    safeWeekendReturn('/weekend/st-poelten/2026-08-14'),
    '/weekend/st-poelten/2026-08-14',
  );
});

test('rejects external, protocol-relative, and path-traversal returns', () => {
  assert.equal(safeWeekendReturn('https://evil.example/weekend/linz/2026-08-14'), null);
  assert.equal(safeWeekendReturn('//evil.example/weekend/linz/2026-08-14'), null);
  assert.equal(safeWeekendReturn('/weekend/linz/../admin'), null);
});

test('rejects undated, query-bearing, and non-string returns', () => {
  assert.equal(safeWeekendReturn('/weekend/linz'), null);
  assert.equal(safeWeekendReturn('/weekend/linz/2026-08-14?next=/admin'), null);
  assert.equal(safeWeekendReturn(null), null);
});

test('accepts only published discovery route shapes', () => {
  assert.equal(safeDiscoveryReturn('/events/linz'), '/events/linz');
  assert.equal(safeDiscoveryReturn('/events/linz/heute'), '/events/linz/heute');
  assert.equal(safeDiscoveryReturn('/events/wien/wochenende'), '/events/wien/wochenende');
  assert.equal(safeDiscoveryReturn('/events/sankt-poelten/2026/09'), '/events/sankt-poelten/2026/09');
  assert.equal(safeDiscoveryReturn('/weekend/linz/2026-08-21'), '/weekend/linz/2026-08-21');
});

test('rejects unsafe or unbounded discovery returns', () => {
  assert.equal(safeDiscoveryReturn('https://evil.example/events/linz'), null);
  assert.equal(safeDiscoveryReturn('//evil.example/events/linz'), null);
  assert.equal(safeDiscoveryReturn('/events/linz/../../admin'), null);
  assert.equal(safeDiscoveryReturn('/events/linz?next=/admin'), null);
  assert.equal(safeDiscoveryReturn('/events/linz/2026/9'), null);
  assert.equal(safeDiscoveryReturn('/admin'), null);
});
