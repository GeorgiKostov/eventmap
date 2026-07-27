import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCountry, normalizeCrawlMode, sourceMatchesCrawlPolicy,
} from '../lib/crawl-policy.js';

test('crawl policy validates country and mode inputs', () => {
  assert.equal(normalizeCountry('at'), 'AT');
  assert.equal(normalizeCountry(null), null);
  assert.equal(normalizeCrawlMode(), 'all');
  assert.equal(normalizeCrawlMode('LLM'), 'llm');
  assert.throws(() => normalizeCountry('Austria'), /two-letter country code/);
  assert.throws(() => normalizeCrawlMode('paid'), /Unknown crawl mode/);
});

test('Austria policy excludes other countries and keeps legacy null country as AT', () => {
  assert.equal(sourceMatchesCrawlPolicy({ country: 'AT' }, { country: 'AT' }), true);
  assert.equal(sourceMatchesCrawlPolicy({ country: null }, { country: 'AT' }), true);
  assert.equal(sourceMatchesCrawlPolicy({ country: 'BG' }, { country: 'AT' }), false);
  assert.equal(sourceMatchesCrawlPolicy({ country: 'DE' }, { country: 'AT' }), false);
});

test('structured and LLM lanes are disjoint and unknown routes join the weekly lane', () => {
  const structured = { feed_kind: 'gem2go' };
  const llm = { feed_kind: 'llm' };
  const unknown = { feed_kind: null };

  assert.equal(sourceMatchesCrawlPolicy(structured, { mode: 'structured' }), true);
  assert.equal(sourceMatchesCrawlPolicy(llm, { mode: 'structured' }), false);
  assert.equal(sourceMatchesCrawlPolicy(unknown, { mode: 'structured' }), false);

  assert.equal(sourceMatchesCrawlPolicy(structured, { mode: 'llm' }), false);
  assert.equal(sourceMatchesCrawlPolicy(llm, { mode: 'llm' }), true);
  assert.equal(sourceMatchesCrawlPolicy(unknown, { mode: 'llm' }), true);
});
