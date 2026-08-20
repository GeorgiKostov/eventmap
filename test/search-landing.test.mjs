import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('map deep-link coordinates seed both camera and distance reference', () => {
  const page = read('app/page.js');

  assert.match(page, /const start = initialCenter\(\);\s+setMe\(start\);\s+setMapCenter\(start\);/);
});

test('nearby recommendations are future-starting and render on current and archived event pages', () => {
  const db = read('lib/db.js');
  const page = read('app/event/[id]/page.js');

  assert.match(db, /starts_at::timestamp::date\s*>=/);
  assert.match(page, /\{nearby\.length > 0 && \(/);
  assert.doesNotMatch(page, /isArchived && nearby\.length/);
});

test('event landing conversions cover views, map, source, recommendations, and newsletter area', () => {
  const page = read('app/event/[id]/page.js');
  const analytics = read('app/event-analytics.js');
  const newsletter = read('app/newsletter-signup.js');

  assert.match(analytics, /event_landing_view/);
  assert.match(page, /event_map_open/);
  assert.match(page, /event_source_open/);
  assert.match(page, /event_recommendation_open/);
  assert.match(newsletter, /newsletter_signup_started.*area: area\.label/);
});

test('disputed events remain readable but lose search claims and show their warning', () => {
  const page = read('app/event/[id]/page.js');

  assert.match(page, /isArchived \|\| !when \|\| ev\.report_flag/);
  assert.match(page, /isArchived \|\| ev\.report_flag/);
  assert.match(page, /ui\.reportFlags\?\.\[ev\.report_flag\]/);
});
