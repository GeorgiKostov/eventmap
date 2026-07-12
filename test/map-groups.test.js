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
