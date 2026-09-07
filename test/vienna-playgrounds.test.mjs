import test from 'node:test';
import assert from 'node:assert/strict';
import { parseViennaPlaygrounds, VIENNA_PLAYGROUNDS_URL } from '../lib/vienna-playgrounds.js';

const feature = (name, type = 'Spielplatz', coordinates = [16.35, 48.2]) => ({
  geometry: { type: 'Point', coordinates },
  properties: { ANL_NAME: name, TYP_DETAIL: type },
});
const collection = (features) => ({ type: 'FeatureCollection', totalFeatures: features.length, features });

test('Vienna playgrounds retain supplied points and credit without inventing event facts', () => {
  const [place] = parseViennaPlaygrounds(collection([feature('Richard-Waldemar-Park', 'Ballspielkäfig, Spielplatz')]));
  assert.equal(place.kind, 'place');
  assert.equal(place.title, 'Richard-Waldemar-Park – Spielplatz');
  assert.deepEqual([place.lng, place.lat], [16.35, 48.2]);
  assert.equal(place.source_url, VIENNA_PLAYGROUNDS_URL);
  assert.match(place.description, /Datenquelle: Stadt Wien – data.wien.gv.at/);
  assert.match(place.description, /https:\/\/creativecommons.org\/licenses\/by\/4.0\//);
  assert.equal(place.date_start, undefined);
  assert.equal(place.is_free, null);
  assert.equal(place.age_min, null);
  assert.equal(place.opening_hours, null);
});

test('Vienna playgrounds skip sports-only points, unnamed places, invalid coordinates and ambiguous names', () => {
  const places = parseViennaPlaygrounds(collection([
    feature('Ballplatz', 'Ballspielplatz'), feature('Fitness', 'Generationenspielplatz'),
    feature(''), feature('Wrong axis', 'Spielplatz', [48.2, 16.35]),
    feature('Bad coordinate', 'Spielplatz', [16.35, null]),
    feature('Prater'), feature('Prater', 'Wasserspielplatz', [16.4, 48.21]),
    feature('Wasserspielplatz Donauinsel', 'Wasserspielplatz'),
  ]));
  assert.equal(places.length, 1);
  assert.equal(places[0].title, 'Wasserspielplatz Donauinsel');
});

test('Vienna playgrounds fail on a truncated or malformed feed', () => {
  assert.throws(() => parseViennaPlaygrounds({}), /FeatureCollection/);
  assert.throws(() => parseViennaPlaygrounds({ ...collection([]), totalFeatures: 3 }), /incomplete/);
});
