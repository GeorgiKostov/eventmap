import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isExtractionBudgetError, isProviderQuotaExhausted, sanitizeExtractedEvents, scanPrompt,
} from '../lib/extract.js';

test('provider quota classifier opens the circuit only for exhausted billing limits', () => {
  assert.equal(isProviderQuotaExhausted(new Error('Your prepayment credits are depleted.')), true);
  assert.equal(isProviderQuotaExhausted(new Error('You have reached your specified API usage limits.')), true);
  assert.equal(isProviderQuotaExhausted(new Error('429 rate limit exceeded; retry later')), false);
  assert.equal(isProviderQuotaExhausted(new Error('503 overloaded')), false);
});

test('poster extraction explicitly forbids guessing unreadable fields', () => {
  const prompt = scanPrompt(null);
  assert.match(prompt, /niemals raten/i);
  assert.doesNotMatch(prompt, /Rate lieber/i);
});

test('crawl extraction rejects impossible dates and copied source prose', () => {
  const copied = 'Dies ist ein vollständig kopierter Beschreibungssatz von der Quelle.';
  const events = sanitizeExtractedEvents([
    { title: 'Bad date', date_start: '2026-02-30' },
    { title: 'Good', date_start: '2026-08-23', time_start: '19:30', description: copied },
  ], `Navigation ${copied} Footer`);
  assert.equal(events.length, 1);
  assert.equal(events[0].description, null);
  assert.equal(events[0].time_start, '19:30');
});

test('budget classifier recognizes the fail-closed extraction budget', () => {
  assert.equal(isExtractionBudgetError({ code: 'EXTRACTION_BUDGET_EXHAUSTED' }), true);
  assert.equal(isExtractionBudgetError(new Error('timeout')), false);
});
