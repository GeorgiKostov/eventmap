import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/weekly-digest.yml', import.meta.url), 'utf8');
const trigger = readFileSync(new URL('../scripts/trigger-weekly-newsletter.mjs', import.meta.url), 'utf8');

test('Thursday workflow prepares fresh, then sends only the Linz issue', () => {
  assert.match(workflow, /cron: '0 9 \* \* 4'/);
  assert.match(workflow, /cron: '0 14 \* \* 4'/);
  assert.match(workflow, /weekly-digest\.mjs --channel linz --notify --regenerate/);
  assert.match(workflow, /trigger-weekly-newsletter\.mjs/);
  assert.match(workflow, /ADMIN_TOKEN: \$\{\{ secrets\.ADMIN_TOKEN \}\}/);
});

test('scheduled trigger uses a bearer token and cannot request a forced resend', () => {
  assert.match(trigger, /authorization: `Bearer \$\{token\}`/);
  assert.match(trigger, /action: 'send', channel: 'linz', automatic: true/);
  assert.doesNotMatch(trigger, /force:\s*true/);
});
