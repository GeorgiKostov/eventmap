import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { serverAnalyticsEnabled } from '../lib/analytics-server.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('server conversion capture is production-only', () => {
  assert.equal(serverAnalyticsEnabled({ VERCEL_ENV: 'production' }), true);
  assert.equal(serverAnalyticsEnabled({ VERCEL_ENV: 'preview' }), false);
  assert.equal(serverAnalyticsEnabled({ NODE_ENV: 'production' }), false);
});

test('newsletter confirmation is idempotent, aggregate, and PII-free in analytics', () => {
  const db = read('lib/db.js');
  const route = read('app/api/subscribe/confirm/route.js');

  assert.match(db, /AS newly_confirmed/);
  assert.match(db, /COALESCE\(s\.confirmed_at, now\(\)\)/);
  assert.match(route, /if \(subscriber\.newlyConfirmed\)/);
  assert.match(route, /captureServer\('newsletter_confirmed'/);
  const capture = route.slice(route.indexOf("captureServer('newsletter_confirmed'"), route.indexOf('    });', route.indexOf("captureServer('newsletter_confirmed'")) + 7);
  assert.doesNotMatch(capture, /subscriber\.email|token:/);
});

test('client proof excludes non-canonical, automated, and marked-internal traffic', () => {
  const analytics = read('lib/analytics.js');

  assert.match(analytics, /'okolo\.events', 'www\.okolo\.events'/);
  assert.match(analytics, /navigator\.webdriver/);
  assert.match(analytics, /okolo_internal/);
  assert.match(analytics, /localStorage\.getItem\(INTERNAL_KEY\)/);
  assert.match(analytics, /autocapture: false/);
  assert.match(analytics, /disable_session_recording: true/);
});

test('paid proof covers impressions, opens, and source referrals on all current surfaces', () => {
  const analytics = read('app/event-analytics.js');
  const eventPage = read('app/event/[id]/page.js');
  const map = read('app/page.js');
  const weekend = read('app/weekend/[city]/[weekend]/page.js');

  for (const name of ['sponsored_impression', 'sponsored_open', 'sponsored_referral']) {
    assert.ok([analytics, eventPage, map, weekend].some((source) => source.includes(name)), `${name} missing`);
  }
  assert.match(eventPage, /surface: 'event_page'/);
  assert.match(map, /surface: 'map'/);
  assert.match(weekend, /surface="weekend_page"/);
  assert.match(weekend, /weekend_event_open/);
  assert.match(weekend, /weekend_map_open/);
});

test('the proof contract defines metrics, caveats, and outside-Okolo work', () => {
  const doc = read('docs/ops/advertiser-proof.md');
  const todo = read('tasks/todo.md');

  assert.match(doc, /Europe\/Vienna/);
  assert.match(doc, /not an IAB viewability claim/);
  assert.match(doc, /four consecutive weekends/);
  assert.match(todo, /Outside Okolo — PostHog/);
  assert.match(todo, /Outside Okolo — Search Console/);
  assert.match(todo, /Outside Okolo — campaign operations/);
});

