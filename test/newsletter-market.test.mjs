import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newsletterCountrySupported } from '../lib/newsletter-market.js';
import { newsletterAreaSupported } from '../lib/newsletter-area.js';
import { searchPlaces } from '../lib/places.js';
import { STRINGS } from '../lib/i18n.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('newsletter market accepts Austrian localities only', () => {
  assert.equal(newsletterCountrySupported('AT'), true);
  assert.equal(newsletterCountrySupported('BG'), false);
  assert.equal(newsletterCountrySupported('DE'), false);
  assert.equal(newsletterAreaSupported({ country: 'AT', lat: 48.3069, lng: 14.2858 }), true);
  assert.equal(newsletterAreaSupported({ country: 'BG', lat: 42.1354, lng: 24.7453 }), false);
  assert.equal(newsletterAreaSupported({ country: 'AT', lat: 48.1351, lng: 11.582 }), false);
  assert.equal(newsletterAreaSupported({ country: 'AT', lat: 0, lng: 0 }), false);
});

test('the place gazetteer identifies Austrian, Bulgarian and German newsletter countries', () => {
  assert.equal(searchPlaces('Linz', { limit: 1 })[0].country, 'AT');
  assert.equal(searchPlaces('Plovdiv', { limit: 1 })[0].country, 'BG');
  assert.equal(searchPlaces('Berlin', { limit: 1 })[0].country, 'DE');
});

test('unsupported-country warning is localized in every UI language', () => {
  assert.match(STRINGS.de.nlCountryUnsupported, /Österreich/);
  assert.match(STRINGS.en.nlCountryUnsupported, /Austria/);
  assert.match(STRINGS.bg.nlCountryUnsupported, /Австрия/);
});

test('every signup surface sends a closed country code and the API rejects unsupported markets', () => {
  const popup = read('app/page.js');
  const pageSignup = read('app/newsletter-signup.js');
  const subscribe = read('app/api/subscribe/route.js');
  const eventPage = read('app/event/[id]/page.js');
  const weekendPage = read('app/weekend/[city]/[weekend]/page.js');

  assert.match(popup, /areaCountry: location\.country/);
  assert.match(pageSignup, /areaCountry: area\.country/);
  assert.match(pageSignup, /nlCountryUnsupported/);
  assert.match(eventPage, /country: channel\.country/);
  assert.match(weekendPage, /country: channel\.country/);
  assert.match(subscribe, /code: 'unsupported_country'/);
  assert.match(subscribe, /newsletterAreaSupported/);
});

test('non-Austrian delivery is blocked in the admin route and CLI', () => {
  const route = read('app/api/admin/digest/route.js');
  const cli = read('scripts/weekly-digest.mjs');
  assert.match(route, /if \(!newsletterCountrySupported\(channel\.country\)\)/);
  assert.match(cli, /channels\.some\(\(channel\) => !newsletterCountrySupported\(channel\.country\)\)/);
});

test('geocode results carry the resolved country back to the newsletter UI', () => {
  const geocode = read('app/api/geocode/route.js');
  assert.match(geocode, /country: \(f\.properties\?\.countrycode \|\| ''\)\.toUpperCase\(\)/);
  assert.match(geocode, /result: result \? \{ \.\.\.result, country: resolvedCountry \} : null/);
});
