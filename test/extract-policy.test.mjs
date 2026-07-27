import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isExtractionBudgetError, isProviderQuotaExhausted,
} from '../lib/extract.js';

test('provider quota classifier opens the circuit only for exhausted billing limits', () => {
  assert.equal(isProviderQuotaExhausted(new Error('Your prepayment credits are depleted.')), true);
  assert.equal(isProviderQuotaExhausted(new Error('You have reached your specified API usage limits.')), true);
  assert.equal(isProviderQuotaExhausted(new Error('429 rate limit exceeded; retry later')), false);
  assert.equal(isProviderQuotaExhausted(new Error('503 overloaded')), false);
});

test('budget classifier recognizes the fail-closed extraction budget', () => {
  assert.equal(isExtractionBudgetError({ code: 'EXTRACTION_BUDGET_EXHAUSTED' }), true);
  assert.equal(isExtractionBudgetError(new Error('timeout')), false);
});
