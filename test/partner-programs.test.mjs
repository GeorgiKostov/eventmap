import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PARTNER_PROGRAM_SLUGS, partnerEventMatches, partnerProgram } from '../lib/partner-programs.js';

test('partner programme exposes a bounded Ars Electronica festival view', () => {
  const programme = partnerProgram('aecfestival');
  assert.equal(programme.dateFrom, '2026-09-09');
  assert.equal(programme.dateTo, '2026-09-13');
  assert.match(programme.sourceUrl, /^https:\/\/ars\.electronica\.art\//);
  assert.deepEqual(PARTNER_PROGRAM_SLUGS, ['aecfestival']);
});

test('partner event matching is exact and unknown slugs fail closed', () => {
  const programme = partnerProgram('aecfestival');
  assert.equal(partnerEventMatches(programme, { source_name: programme.sourceName }), true);
  assert.equal(partnerEventMatches(programme, { source_name: 'Another festival' }), false);
  assert.equal(partnerProgram('missing'), null);
});

test('uncommissioned Ars Electronica concept fails closed in production', async () => {
  const route = await readFile(new URL('../app/aecfestival/page.js', import.meta.url), 'utf8');
  assert.match(route, /process\.env\.NODE_ENV === 'production'/);
  assert.match(route, /notFound\(\)/);
});
