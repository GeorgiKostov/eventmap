import test from 'node:test';
import assert from 'node:assert/strict';
import { contentHash, legacyContentHash } from '../lib/db.js';

const event = (overrides = {}) => ({
  title: 'Kindertheater: Der Räuber', starts_at: '2026-07-20T10:00',
  town: 'Stuttgart', venue: 'Junges Schloss', ...overrides,
});

test('event hashes preserve same-day occurrences at different times', () => {
  assert.notEqual(contentHash(event()), contentHash(event({ starts_at: '2026-07-20T14:00' })));
});

test('event hashes preserve simultaneous occurrences at different venues', () => {
  assert.notEqual(contentHash(event()), contentHash(event({ venue: 'Theater am Faden' })));
});

test('event hashes preserve simultaneous occurrences at different addresses when venue is unknown', () => {
  assert.notEqual(
    contentHash(event({ venue: null, address: 'Löwen-Markt 1' })),
    contentHash(event({ venue: null, address: 'Strümpfelbacher Straße 45' })),
  );
});

test('event hash normalization remains idempotent for punctuation and case', () => {
  assert.equal(
    contentHash(event()),
    contentHash(event({ title: 'KINDERTHEATER – DER RÄUBER', venue: 'Junges-Schloss' })),
  );
});

test('legacy hash remains available for lazy migration and places stay stable', () => {
  assert.equal(legacyContentHash(event()), 'kindertheaterderräuber|2026-07-20|stuttgart');
  assert.equal(contentHash({ kind: 'place', title: 'Junges Schloss', town: 'Stuttgart' }), 'place|jungesschloss|stuttgart');
});
