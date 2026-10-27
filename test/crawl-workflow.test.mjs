import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/crawl.yml', import.meta.url), 'utf8');
const refreshScript = readFileSync(new URL('../scripts/refresh-seo.mjs', import.meta.url), 'utf8');

test('scheduled crawl is Austria-only and structured-only', () => {
  assert.match(workflow, /cron: '0 4 \* \* \*'/);
  assert.equal((workflow.match(/cron:/g) || []).length, 1);
  assert.match(workflow, /node scripts\/crawl\.mjs --country AT --mode structured/);
  assert.doesNotMatch(workflow, /inputs\.mode|CRAWL_MODE|MAX_LLM_CALLS/);
});

test('automated workflows receive no AI provider credentials', () => {
  const digest = readFileSync(new URL('../.github/workflows/weekly-digest.yml', import.meta.url), 'utf8');
  for (const contents of [workflow, digest]) {
    assert.doesNotMatch(contents, /(?:GEMINI|ANTHROPIC|OPENAI|XAI)_API_KEY:/);
  }
});

test('successful crawl invalidates the SEO ISR subtree', () => {
  assert.match(workflow, /name: Refresh SEO pages/);
  assert.match(workflow, /ADMIN_TOKEN: \$\{\{ secrets\.ADMIN_TOKEN \}\}/);
  assert.match(workflow, /NEXT_PUBLIC_BASE_URL: https:\/\/www\.okolo\.events/);
  assert.match(workflow, /node scripts\/refresh-seo\.mjs/);
  assert.match(refreshScript, /'https:\/\/www\.okolo\.events'/);
});
