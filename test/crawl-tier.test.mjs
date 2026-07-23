import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIER_CADENCE_DAYS, conditionalHeadersForSource, isDue, shouldForceCrawl,
} from '../scripts/crawl.mjs';

const NOW = Date.parse('2026-07-23T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 86400000).toISOString();

test('dead sources are quarantined for 28 days, then become due again', () => {
  assert.equal(TIER_CADENCE_DAYS.dead, 28);
  assert.equal(isDue({ tier: 'dead', last_crawled: daysAgo(27) }, NOW), false);
  assert.equal(isDue({ tier: 'dead', last_crawled: daysAgo(28) }, NOW), true);
});

test('a due dead-source crawl is forced through hash and conditional-cache checks', () => {
  assert.equal(shouldForceCrawl({ tier: 'dead' }), true);
  assert.equal(shouldForceCrawl({ tier: 'dormant' }), false);
  assert.equal(shouldForceCrawl({ tier: 'active' }, true), true);

  const cached = { etag: '"abc"', last_modified: 'Wed, 22 Jul 2026 08:00:00 GMT' };
  assert.deepEqual(conditionalHeadersForSource(cached, true), {});
  assert.deepEqual(conditionalHeadersForSource(cached, false), {
    'If-None-Match': '"abc"',
    'If-Modified-Since': 'Wed, 22 Jul 2026 08:00:00 GMT',
  });
});
