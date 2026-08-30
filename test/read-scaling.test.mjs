import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalMapViewport } from '../lib/map-request.js';
import { publicCacheHeaders } from '../lib/public-cache.js';
import { shouldRefreshSession } from '../lib/session-refresh.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('map viewports use stable zoom-aligned cache keys without clipping the visible area', () => {
  const original = [14.251234, 48.278765, 14.352345, 48.348765];
  const first = canonicalMapViewport(original, 13.18);
  const nearby = canonicalMapViewport(original.map((value) => value + 0.00001), 13.22);

  assert.deepEqual(first, nearby);
  assert.equal(first.zoom, 13);
  assert.ok(first.bbox[0] <= original[0]);
  assert.ok(first.bbox[1] <= original[1]);
  assert.ok(first.bbox[2] >= original[2]);
  assert.ok(first.bbox[3] >= original[3]);

  const overview = canonicalMapViewport([4.25, 40.25, 23.75, 59.75], 1);
  assert.ok(overview.bbox[2] - overview.bbox[0] <= 20);
  assert.ok(overview.bbox[3] - overview.bbox[1] <= 20);
});

test('public cache headers distinguish browser and edge lifetimes', () => {
  const headers = publicCacheHeaders({ browser: 15, edge: 60, stale: 300 });
  assert.match(headers['Cache-Control'], /max-age=15/);
  assert.match(headers['CDN-Cache-Control'], /s-maxage=60/);
  assert.match(headers['Vercel-CDN-Cache-Control'], /stale-while-revalidate=300/);
});

test('public map, geocoder and sales reads bypass account refresh but mutations do not', () => {
  const req = (pathname, method = 'GET') => ({ method, nextUrl: { pathname } });
  assert.equal(shouldRefreshSession(req('/api/events')), false);
  assert.equal(shouldRefreshSession(req('/api/geocode')), false);
  assert.equal(shouldRefreshSession(req('/partners')), false);
  assert.equal(shouldRefreshSession(req('/api/events', 'POST')), true);
  assert.equal(shouldRefreshSession(req('/api/account/session')), true);
});

test('map reads are CDN-cacheable and avoid count/reaction full-table round trips', () => {
  const route = read('app/api/events/route.js');
  const db = read('lib/db.js');
  assert.match(route, /publicCacheHeaders/);
  assert.match(route, /filters\.source \? 300 : 60/);
  assert.match(db, /count\(\*\) OVER \(\)/i);
  assert.match(db, /sum\(count\(\*\)\) OVER \(\)/i);
  assert.match(db, /WHERE r\.event_id=l\.id/);
  assert.doesNotMatch(db.match(/export async function mapPins[\s\S]*?export async function mapCells/)?.[0] || '', /\$\{REACTION_JOIN\}/);
});

test('public geocoders have shared throttling, configurable Photon and failure-safe caching', () => {
  const route = read('app/api/geocode/route.js');
  const geocode = read('lib/geocode.js');
  assert.match(route, /process\.env\.PHOTON_URL/);
  assert.match(route, /globalPerDay: 5000/);
  assert.match(route, /cacheable: false/);
  assert.match(geocode, /claimExternalRateSlot\('nominatim-public', 1100\)/);
});

test('search and partner map filters have migration-backed indexes', () => {
  const db = read('lib/db.js');
  const migration = read('scripts/migrate-read-scaling.mjs');
  assert.match(db, /search_normalize\(/);
  assert.match(migration, /events_published_search_trgm_idx/);
  assert.match(migration, /events_published_source_idx/);
  assert.match(migration, /events_published_geom_idx/);
});
