import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/page.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('mobile location uses a high-accuracy live watch with Google-Maps-style follow behavior', () => {
  assert.match(page, /new maplibregl\.GeolocateControl\(\{/);
  assert.match(page, /positionOptions:\s*\{\s*enableHighAccuracy:\s*true,\s*timeout:\s*15000,\s*maximumAge:\s*0\s*\}/);
  assert.match(page, /trackUserLocation:\s*true/);
  assert.doesNotMatch(page, /geolocation\.getCurrentPosition/);
});

test('live location renders the moving puck and physical accuracy circle', () => {
  assert.match(page, /showUserLocation:\s*true/);
  assert.match(page, /showAccuracyCircle:\s*true/);
  assert.match(page, /geolocate\.on\('geolocate'/);
  assert.match(css, /\.maplibregl-user-location-dot::before/);
  assert.match(css, /\.maplibregl-user-location-accuracy-circle/);
});
