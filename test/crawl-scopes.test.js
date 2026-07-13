import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crawlScope, distanceKm, isWithinCrawlScope, scopeForSource, sourceCatalogPoint,
} from '../lib/crawl-scopes.js';

const scope = crawlScope('stuttgart-40km');

test('Stuttgart crawl scope has the requested fixed center and radius', () => {
  assert.deepEqual(scope.center, { lat: 48.7758, lng: 9.1829 });
  assert.equal(scope.radiusKm, 40);
  assert.equal(scope.country, 'DE');
  assert.equal(scope.sourceRegion, 'Stuttgart 40km');
});

test('scope uses a deterministic great-circle boundary', () => {
  assert.equal(isWithinCrawlScope({ lat: 48.8, lng: 9.2 }, scope), true);
  assert.equal(isWithinCrawlScope({ lat: 49.2, lng: 9.2 }, scope), false);
  assert.equal(distanceKm(scope.center, scope.center), 0);
  assert.equal(isWithinCrawlScope({ lat: NaN, lng: 9.2 }, scope), false);
});

test('only an explicitly tagged source acquires the Stuttgart scope', () => {
  assert.equal(scopeForSource({ country: 'DE', region: 'Stuttgart 40km' }), scope);
  assert.equal(scopeForSource({ country: 'DE', region: 'Baden-Württemberg' }), null);
  assert.equal(scopeForSource({ country: 'AT', region: 'Stuttgart 40km' }), null);
});

test('probed source points accept explicit centroid fields and reject missing coordinates', () => {
  assert.deepEqual(sourceCatalogPoint({ centroid_lat: '48.8', centroid_lng: '9.2' }), { lat: 48.8, lng: 9.2 });
  assert.equal(sourceCatalogPoint({ town: 'Esslingen am Neckar' }), null);
});
