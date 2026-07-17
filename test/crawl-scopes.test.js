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

test('Berlin and Munich scopes match their catalogs and stay independent of each other', () => {
  const berlin = crawlScope('berlin-40km');
  const munich = crawlScope('munich-40km');
  assert.deepEqual(berlin.center, { lat: 52.52, lng: 13.405 });
  assert.deepEqual(munich.center, { lat: 48.1351, lng: 11.582 });
  for (const s of [berlin, munich]) {
    assert.equal(s.country, 'DE');
    assert.equal(s.radiusKm, 40);
  }
  // The regions are the exact strings the probed catalogs' rows carry —
  // a mismatch makes scopeForSource() return null and the boundary vanish.
  assert.equal(berlin.sourceRegion, 'Berlin 40km');
  assert.equal(munich.sourceRegion, 'München 40km');
  assert.equal(scopeForSource({ country: 'DE', region: 'Berlin 40km' }), berlin);
  assert.equal(scopeForSource({ country: 'DE', region: 'München 40km' }), munich);
  // Berlin's ring must not swallow Munich's, nor Stuttgart's.
  assert.equal(isWithinCrawlScope(munich.center, berlin), false);
  assert.equal(isWithinCrawlScope(berlin.center, munich), false);
  assert.equal(isWithinCrawlScope({ lat: 52.4, lng: 13.2 }, berlin), true); // Kleinmachnow-ish
  assert.equal(isWithinCrawlScope({ lat: 48.4, lng: 11.75 }, munich), true); // Freising-ish
});

test('the German metro-2 scopes (Hamburg, Köln, Frankfurt) resolve and stay separate', () => {
  const hh = crawlScope('hamburg-40km');
  const cgn = crawlScope('cologne-40km');
  const ffm = crawlScope('frankfurt-40km');
  for (const s of [hh, cgn, ffm]) { assert.equal(s.country, 'DE'); assert.equal(s.radiusKm, 40); }
  assert.equal(hh.sourceRegion, 'Hamburg 40km');
  assert.equal(cgn.sourceRegion, 'Köln 40km');
  assert.equal(ffm.sourceRegion, 'Frankfurt 40km');
  assert.equal(scopeForSource({ country: 'DE', region: 'Köln 40km' }), cgn);
  // no two metro centers fall inside another's ring
  for (const [a, b] of [[hh, cgn], [cgn, ffm], [hh, ffm]]) {
    assert.equal(isWithinCrawlScope(a.center, b), false);
    assert.equal(isWithinCrawlScope(b.center, a), false);
  }
});

test('an unknown scope id is null, never a silently widened default', () => {
  assert.equal(crawlScope('leipzig-40km'), null);
  assert.equal(crawlScope('bremen-40km'), null);
  assert.equal(crawlScope(''), null);
});
