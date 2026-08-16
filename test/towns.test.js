import test from 'node:test';
import assert from 'node:assert/strict';
import { TOWNS, townCentroid } from '../lib/towns.js';

test('town centroid fuzzy matching requires a complete place-name token', () => {
  assert.equal(townCentroid('Stadt Enns'), TOWNS.Enns);
  assert.equal(townCentroid('Linz-Pichling'), TOWNS.Linz);
  assert.equal(townCentroid('Wenns'), null);
  assert.equal(townCentroid('Ennsdorf'), null);
});
