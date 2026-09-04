import test from 'node:test';
import assert from 'node:assert/strict';
import {
  automaticDigestProblem,
  automaticDigestRequestAllowed,
  AUTO_SEND_MAX_AGE_MS,
} from '../lib/digest-auto-send.js';

const NOW = new Date('2026-09-03T14:00:00.000Z');

function fixture({ preparedAt = '2026-09-03T09:00:00.000Z', count = 5 } = {}) {
  const items = Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    eventUpdatedAt: '2026-09-03T08:30:00.000Z',
  }));
  return {
    digest: { preparedAt, items },
    events: items.map((item) => ({ id: item.id, updated_at: '2026-09-03T08:30:00.000Z' })),
  };
}

test('automatic send accepts a fresh complete digest whose events are unchanged', () => {
  const { digest, events } = fixture();
  assert.equal(automaticDigestProblem(digest, events, { now: NOW }), null);
});

test('automatic send rejects old or pre-automation snapshots', () => {
  const stale = fixture({ preparedAt: new Date(NOW.getTime() - AUTO_SEND_MAX_AGE_MS - 1).toISOString() });
  assert.match(automaticDigestProblem(stale.digest, stale.events, { now: NOW }), /not freshly prepared/);

  const legacy = fixture();
  delete legacy.digest.preparedAt;
  assert.match(automaticDigestProblem(legacy.digest, legacy.events, { now: NOW }), /not freshly prepared/);
});

test('automatic send requires five picks and every pick to remain eligible', () => {
  const thin = fixture({ count: 4 });
  assert.match(automaticDigestProblem(thin.digest, thin.events, { now: NOW }), /fewer than 5/);

  const missing = fixture();
  missing.events.pop();
  assert.match(automaticDigestProblem(missing.digest, missing.events, { now: NOW }), /no longer eligible/);
});

test('automatic send stops when any event changed after the frozen snapshot', () => {
  const { digest, events } = fixture();
  events[2].updated_at = '2026-09-03T09:30:00.000Z';
  assert.match(automaticDigestProblem(digest, events, { now: NOW }), /changed after/);
});

test('scheduled bearer is restricted to non-forced live-edition sends', () => {
  const valid = { action: 'send', channel: 'linz', automatic: true };
  assert.equal(automaticDigestRequestAllowed(valid, 'linz', true), true);
  assert.equal(automaticDigestRequestAllowed({ ...valid, channel: 'wien' }, 'wien', true), true);
  assert.equal(automaticDigestRequestAllowed({ ...valid, channel: 'innsbruck' }, 'innsbruck', true), true);
  assert.equal(automaticDigestRequestAllowed({ ...valid, force: true }, 'linz', true), false);
  assert.equal(automaticDigestRequestAllowed({ ...valid, action: 'regenerate' }, 'linz', true), false);
  assert.equal(automaticDigestRequestAllowed({ ...valid, channel: 'plovdiv' }, 'plovdiv', true), false);
  assert.equal(automaticDigestRequestAllowed(valid, 'linz', false), false);
});
