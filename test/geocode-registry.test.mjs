import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueVenueRow } from '../lib/db.js';
import { registryVenueNearTown } from '../lib/geocode.js';

const linz = { lat: 48.3069, lng: 14.2858 };
const kletterzentrum = { lat: 48.3292673, lng: 14.3236669, geo_precision: 'venue' };

test('accepts a unique registry venue when the source town is an alias', () => {
  const registry = uniqueVenueRow([kletterzentrum]);
  assert.equal(registry, kletterzentrum);
  assert.equal(registryVenueNearTown(registry, linz), true);
});

test('rejects a unique same-name registry venue outside the town bound', () => {
  const farVenue = { lat: 47.8, lng: 13.0, geo_precision: 'venue' };
  const registry = uniqueVenueRow([farVenue]);
  assert.equal(registry, farVenue);
  assert.equal(registryVenueNearTown(registry, linz), false);
});

test('refuses an ambiguous same-country venue name instead of guessing', () => {
  assert.equal(uniqueVenueRow([
    { lat: 48.2, lng: 14.3, geo_precision: 'venue' },
    { lat: 47.8, lng: 13.0, geo_precision: 'venue' },
  ]), null);
});
