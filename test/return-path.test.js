import test from 'node:test';
import assert from 'node:assert/strict';
import { safeWeekendReturn } from '../lib/return-path.js';

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
