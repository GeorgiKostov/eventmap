import test from 'node:test';
import assert from 'node:assert/strict';
import { groupEventSeries } from '../lib/map-groups.js';

function event(id, title, town, { precision = 'town', venue = null, lat = 48.3, lng = 14.3 } = {}) {
  return {
    id, kind: 'event', title, town, venue, lat, lng, geo_precision: precision,
    starts_at: `2026-07-${String(id).padStart(2, '0')}T10:00`,
  };
}

test('groups repeated titles only within one town', () => {
  const result = groupEventSeries([
    event(1, 'Science Show', 'Graz'),
    event(2, 'Science Show', 'Graz'),
    event(3, 'Science Show', 'Wien'),
  ]);
  assert.deepEqual(result.groups.map((group) => group.members.map((item) => item.id)), [[1, 2]]);
  assert.equal(result.byId.has(3), false);
});

test('accepts conservative town/year suffix variants and prefers a resolved anchor', () => {
  const result = groupEventSeries([
    event(1, 'Pflasterspektakel – Internationales Straßenkunstfestival', 'Linz'),
    event(2, 'Pflasterspektakel – Internationales Straßenkunstfestival Linz 2026', 'Linz', {
      precision: 'venue', venue: 'Hauptplatz', lat: 48.305, lng: 14.286,
    }),
  ]);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].anchor.id, 2);
});

test('does not merge different program titles that only share festival words', () => {
  const result = groupEventSeries([
    event(1, 'Ars Electronica Festival: Opening', 'Linz'),
    event(2, 'Ars Electronica Festival: Family Tour', 'Linz'),
  ]);
  assert.equal(result.groups.length, 0);
});

test('splits a same-title series across distinct venues instead of collapsing to one pin', () => {
  // A workshop with the same name held at three different community centres in
  // one town must stay three pins — not one that hides the other two locations.
  const result = groupEventSeries([
    event(1, 'Ferienspiel Workshop', 'Wien', { precision: 'venue', venue: 'VHS Favoriten', lat: 48.17, lng: 16.37 }),
    event(2, 'Ferienspiel Workshop', 'Wien', { precision: 'venue', venue: 'VHS Favoriten', lat: 48.17, lng: 16.37 }),
    event(3, 'Ferienspiel Workshop', 'Wien', { precision: 'venue', venue: 'VHS Ottakring', lat: 48.21, lng: 16.31 }),
    event(4, 'Ferienspiel Workshop', 'Wien', { precision: 'venue', venue: 'VHS Ottakring', lat: 48.21, lng: 16.31 }),
    event(5, 'Ferienspiel Workshop', 'Wien', { precision: 'venue', venue: 'VHS Meidling', lat: 48.18, lng: 16.33 }),
  ]);
  const byVenue = result.groups.map((g) => g.members.map((m) => m.id).sort());
  // Two venues have ≥2 occurrences → two series; the single Meidling one is not a series.
  assert.equal(result.groups.length, 2);
  assert.deepEqual(byVenue.sort(), [[1, 2], [3, 4]]);
  assert.equal(result.byId.has(5), false);
});

test('keeps a single-venue repeating series collapsed (venue-less occurrences included)', () => {
  const result = groupEventSeries([
    event(1, 'Bauernmarkt', 'Enns', { precision: 'venue', venue: 'Hauptplatz', lat: 48.21, lng: 14.47 }),
    event(2, 'Bauernmarkt', 'Enns', { venue: null }), // venue-less occurrence joins the single venue
    event(3, 'Bauernmarkt', 'Enns', { precision: 'venue', venue: 'Hauptplatz', lat: 48.21, lng: 14.47 }),
  ]);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].members.map((m) => m.id).sort(), [1, 2, 3]);
});

test('town-centroid (sentinel) coords never merge distinct events by proximity', () => {
  // Different-title, town-precision events share identical centroid coords.
  // They must not be grouped just because their coordinates are equal.
  const result = groupEventSeries([
    event(1, 'Flohmarkt', 'Steyr', { precision: 'town', lat: 48.04, lng: 14.42 }),
    event(2, 'Konzert am See', 'Steyr', { precision: 'town', lat: 48.04, lng: 14.42 }),
  ]);
  assert.equal(result.groups.length, 0);
});
