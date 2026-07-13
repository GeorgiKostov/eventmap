import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicate } from '../lib/dedup.js';

const event = (overrides = {}) => ({
  id: 1, kind: 'event', title: 'Leseohren aufgeklappt',
  starts_at: '2026-07-17T16:00', all_day: false,
  town: 'Stuttgart', lat: 48.78, lng: 9.18, geo_precision: 'address',
  ...overrides,
});

test('fuzzy dedup keeps same-day performances at different explicit times', () => {
  const existing = event();
  assert.equal(findDuplicate(event({ starts_at: '2026-07-17T18:00' }), [existing]), null);
});

test('fuzzy dedup keeps simultaneous performances at distinct precise locations', () => {
  const existing = event();
  assert.equal(findDuplicate(event({ lat: 48.80, lng: 9.18 }), [existing]), null);
});

test('an all-day copy can still match an otherwise identical timed event', () => {
  const existing = event();
  assert.equal(findDuplicate(event({ starts_at: '2026-07-17T09:00', all_day: true }), [existing]), existing);
});
