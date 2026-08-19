import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEO_CITIES,
  canonicalSeoPath,
  cityIntentPath,
  cityMonthPath,
  cityPageRange,
  getSeoCity,
  isIndexableEventCount,
  isSupportedMonth,
  monthLabel,
  monthRange,
  resolveSeoCity,
  seoCityForPoint,
  todayRange,
  upcomingMonthSlugs,
} from '../lib/seo-pages.js';
import robots from '../app/robots.js';

test('supports the explicit nine-city Austrian rollout and the Vienna ingress alias', () => {
  assert.equal(SEO_CITIES.length, 9);
  assert.equal(getSeoCity('linz').label, 'Linz');
  assert.equal(getSeoCity('sankt-poelten').label, 'Sankt Pölten');
  assert.equal(getSeoCity('sofia'), null);
  assert.equal(resolveSeoCity('wien').canonical, true);
  assert.equal(resolveSeoCity('vienna').city.slug, 'wien');
  assert.equal(resolveSeoCity('vienna').canonical, false);
});

test('builds exact leap-year month ranges and rejects malformed slugs', () => {
  assert.deepEqual(monthRange('2028-02'), { slug: '2028-02', from: '2028-02-01', to: '2028-02-29' });
  assert.equal(monthRange('2026-2'), null);
  assert.equal(monthRange('2026-13'), null);
  assert.equal(monthRange('1999-12'), null);
  assert.equal(monthLabel('2026-09'), 'September 2026');
});

test('pre-generation and supported windows roll from the Vienna calendar month', () => {
  const now = new Date('2026-08-31T22:30:00Z'); // 2026-09-01 in Vienna
  assert.deepEqual(upcomingMonthSlugs(now, 4), ['2026-09', '2026-10', '2026-11', '2026-12']);
  assert.equal(isSupportedMonth('2026-09', now), true);
  assert.equal(isSupportedMonth('2027-08', now), true);
  assert.equal(isSupportedMonth('2026-08', now), false);
  assert.equal(isSupportedMonth('2027-09', now), false);
});

test('city pages cover today through the end of the third Vienna-local month', () => {
  const now = new Date('2026-08-31T22:30:00Z');
  assert.deepEqual(cityPageRange(now), { from: '2026-09-01', to: '2026-11-30' });
});

test('thin month pages stay reachable but below the indexing threshold', () => {
  assert.equal(isIndexableEventCount(4), false);
  assert.equal(isIndexableEventCount(5), true);
});

test('builds canonical nested month and permanent intent paths', () => {
  const linz = getSeoCity('linz');
  assert.equal(cityMonthPath(linz, '2026-09'), '/events/linz/2026/09');
  assert.equal(cityIntentPath(linz, 'heute'), '/events/linz/heute');
});

test('today uses the Vienna-local calendar date', () => {
  assert.deepEqual(todayRange(new Date('2026-08-31T22:30:00Z')), { from: '2026-09-01', to: '2026-09-01' });
});

test('maps event coordinates upward to the nearest supported SEO city', () => {
  assert.equal(seoCityForPoint(48.3069, 14.2858).slug, 'linz');
  assert.equal(seoCityForPoint(48.1575, 14.0289).slug, 'wels');
  assert.equal(seoCityForPoint(47.2333, 9.6), null);
});

test('keeps the public event catalog crawlable while private API routes stay blocked', () => {
  const policy = robots();
  assert.ok(policy.rules.allow.includes('/api/events'));
  assert.ok(policy.rules.disallow.includes('/api/'));
});

test('normalizes only the Vienna ingress path family', () => {
  assert.equal(canonicalSeoPath('/events/vienna'), '/events/wien');
  assert.equal(canonicalSeoPath('/events/vienna/heute'), '/events/wien/heute');
  assert.equal(canonicalSeoPath('/events/vienna/2026/09'), '/events/wien/2026/09');
  assert.equal(canonicalSeoPath('/events/wien'), null);
});
