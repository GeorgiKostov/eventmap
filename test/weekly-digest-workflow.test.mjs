import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/weekly-digest.yml', import.meta.url), 'utf8');
const trigger = readFileSync(new URL('../scripts/trigger-weekly-newsletter.mjs', import.meta.url), 'utf8');

test('Thursday workflow prepares and sends every live edition', () => {
  assert.match(workflow, /cron: '11 9 \* \* 4'/);
  assert.match(workflow, /cron: '11 14 \* \* 4'/);
  assert.match(workflow, /weekly-digest\.mjs --live --notify --regenerate/);
  assert.match(workflow, /trigger-weekly-newsletter\.mjs/);
  assert.match(workflow, /ADMIN_TOKEN: \$\{\{ secrets\.ADMIN_TOKEN \}\}/);
});

test('scheduled trigger uses a bearer token and cannot request a forced resend', () => {
  assert.match(trigger, /authorization: `Bearer \$\{token\}`/);
  assert.match(trigger, /NEWSLETTER_EDITIONS/);
  assert.match(trigger, /action: 'send', channel: channel\.slug, automatic: true/);
  assert.doesNotMatch(trigger, /force:\s*true/);
});

test('morning prepare mails the operator a preview before the afternoon send', () => {
  const prepare = workflow.slice(workflow.indexOf('  prepare:'), workflow.indexOf('  send:'));
  assert.match(prepare, /trigger-weekly-newsletter\.mjs --preview/);
  assert.match(prepare, /ADMIN_TOKEN: \$\{\{ secrets\.ADMIN_TOKEN \}\}/);
  const send = workflow.slice(workflow.indexOf('  send:'));
  assert.doesNotMatch(send, /--preview/);
  assert.match(trigger, /preview \? \{ test: true \}/);
});
