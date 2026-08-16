import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/crawl.yml', import.meta.url), 'utf8');

test('scheduled crawl is Austria-only with separate structured and LLM schedules', () => {
  assert.match(workflow, /cron: '0 4 \* \* \*'/);
  assert.match(workflow, /cron: '30 4 \* \* 0'/);
  assert.match(workflow, /node scripts\/crawl\.mjs --country AT --mode "\$CRAWL_MODE"/);
});

test('scheduled crawl is Gemini-only and fail-closed on cost', () => {
  assert.match(workflow, /GEMINI_API_KEY:/);
  assert.match(workflow, /EXTRACT_FALLBACK: none/);
  assert.match(workflow, /MAX_LLM_CALLS: 750/);
  assert.doesNotMatch(workflow, /^\s+ANTHROPIC_API_KEY:/m);
});
