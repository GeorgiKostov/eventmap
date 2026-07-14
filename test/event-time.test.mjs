// "The source published no time" must survive every hop without becoming 09:00
// or "ganztägig". Run: node --test test/event-time.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasTime, timeOf, dayOf, makeStartsAt, inTimeOfDay } from '../lib/event-time.js';
import { contentHash } from '../lib/db.js';
import { formatWhen } from '../lib/digest.js';
import { submissionProblem } from '../lib/moderation.js';

test('makeStartsAt never invents a time', () => {
  assert.equal(makeStartsAt('2026-07-19', null), '2026-07-19');
  assert.equal(makeStartsAt('2026-07-19', ''), '2026-07-19');
  assert.equal(makeStartsAt('2026-07-19', undefined), '2026-07-19');
  assert.equal(makeStartsAt('2026-07-19', 'ganztägig'), '2026-07-19'); // junk is not a time
  assert.equal(makeStartsAt('2026-07-19', '25:00'), '2026-07-19'); // out of range
  assert.equal(makeStartsAt('2026-07-19', '16:00'), '2026-07-19T16:00');
  assert.equal(makeStartsAt('2026-07-19', '09:00'), '2026-07-19T09:00'); // a REAL 9am survives
});

test('hasTime / timeOf distinguish unknown from known', () => {
  assert.equal(hasTime('2026-07-19'), false);
  assert.equal(hasTime('2026-07-19T16:00'), true);
  assert.equal(timeOf('2026-07-19'), null); // null, never a default
  assert.equal(timeOf('2026-07-19T16:00'), '16:00');
  assert.equal(dayOf('2026-07-19'), '2026-07-19');
  assert.equal(dayOf('2026-07-19T16:00'), '2026-07-19');
});

test('a time-unknown event is never hidden by a time-of-day filter', () => {
  const unknown = { starts_at: '2026-07-19', all_day: false };
  assert.equal(inTimeOfDay(unknown, ['evening']), true);
  assert.equal(inTimeOfDay(unknown, ['morning']), true);
  // ...but a known time is still filtered honestly.
  const evening = { starts_at: '2026-07-19T20:00', all_day: false };
  assert.equal(inTimeOfDay(evening, ['evening']), true);
  assert.equal(inTimeOfDay(evening, ['morning']), false);
  // The old bug: a 09:00 placeholder silently answered "morning".
  const nine = { starts_at: '2026-07-19T09:00', all_day: false };
  assert.equal(inTimeOfDay(nine, ['morning']), true);
});

test('a time-unknown event hashes apart from a 9am one (they are not the same event)', () => {
  const base = { title: 'Sommerfest', town: 'Linz', venue: 'Hauptplatz' };
  const unknown = contentHash({ ...base, starts_at: '2026-07-19' });
  const nineAm = contentHash({ ...base, starts_at: '2026-07-19T09:00' });
  assert.notEqual(unknown, nineAm);
  // and it is stable
  assert.equal(unknown, contentHash({ ...base, starts_at: '2026-07-19' }));
});

test('the digest prints the day, never an invented clock', () => {
  assert.equal(formatWhen('2026-07-19', false, 'de'), 'So 19.7.');
  assert.equal(formatWhen('2026-07-19T16:00', false, 'de'), 'So 19.7. 16:00');
});

test('an anonymous submission may omit the time but not malform the date', () => {
  const body = { title: 'Sommerfest im Park', starts_at: '2026-07-19', lat: 48.3, lng: 14.3 };
  assert.equal(submissionProblem(body, 'event', '2026-07-14'), null);
  assert.equal(submissionProblem({ ...body, starts_at: '2026-07-19T16:00' }, 'event', '2026-07-14'), null);
  assert.equal(submissionProblem({ ...body, starts_at: '19.07.2026' }, 'event', '2026-07-14'), 'bad_date_format');
  // an END without a time says nothing — still rejected
  assert.equal(submissionProblem({ ...body, ends_at: '2026-07-20' }, 'event', '2026-07-14'), 'bad_date_format');
});
