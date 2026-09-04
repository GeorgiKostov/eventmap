import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NEWSLETTER_EDITIONS,
  newsletterCountrySupported,
  newsletterEdition,
  newsletterEditionForPoint,
} from '../lib/newsletter-market.js';
import { newsletterAreaSupported, newsletterWaitlistAreaSupported } from '../lib/newsletter-area.js';
import { resolveNewsletterPreference } from '../lib/newsletter-preference.js';
import { searchPlaces } from '../lib/places.js';
import { STRINGS } from '../lib/i18n.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('only Linz is a live newsletter edition', () => {
  assert.deepEqual(NEWSLETTER_EDITIONS.map((channel) => channel.slug), ['linz']);
  assert.equal(newsletterEdition('linz')?.label, 'Linz');
  assert.equal(newsletterEdition('graz'), null);
  assert.equal(newsletterEditionForPoint(48.3069, 14.2858)?.slug, 'linz');
  assert.equal(newsletterEditionForPoint(48.1575, 14.0289)?.slug, 'linz');
  assert.equal(newsletterEditionForPoint(47.0707, 15.4395), null);
});

test('weekly delivery remains Austrian while the launch waitlist accepts every served map country', () => {
  assert.equal(newsletterCountrySupported('AT'), true);
  assert.equal(newsletterCountrySupported('BG'), false);
  assert.equal(newsletterCountrySupported('DE'), false);
  assert.equal(newsletterAreaSupported({ country: 'AT', lat: 48.3069, lng: 14.2858 }), true);
  assert.equal(newsletterAreaSupported({ country: 'BG', lat: 42.1354, lng: 24.7453 }), false);
  assert.equal(newsletterAreaSupported({ country: 'AT', lat: 48.1351, lng: 11.582 }), false);
  assert.equal(newsletterAreaSupported({ country: 'AT', lat: 0, lng: 0 }), false);
  assert.equal(newsletterWaitlistAreaSupported({ country: 'AT', lat: 47.0707, lng: 15.4395 }), true);
  assert.equal(newsletterWaitlistAreaSupported({ country: 'BG', lat: 42.1354, lng: 24.7453 }), true);
  assert.equal(newsletterWaitlistAreaSupported({ country: 'DE', lat: 52.5174, lng: 13.3951 }), true);
  assert.equal(newsletterWaitlistAreaSupported({ country: 'US', lat: 40.7, lng: -74 }), false);
});

test('signup choices canonicalize live editions and keep waitlists separate', () => {
  assert.deepEqual(resolveNewsletterPreference({ edition: 'linz', areaLabel: 'Fake' }), {
    kind: 'edition',
    edition: newsletterEdition('linz'),
    areaLabel: 'Linz',
    areaLat: 48.3069,
    areaLng: 14.2858,
    areaCountry: 'AT',
  });
  const waitlist = resolveNewsletterPreference({
    edition: 'waitlist', areaLabel: 'Пловдив', areaLat: 42.1354, areaLng: 24.7453, areaCountry: 'BG',
  });
  assert.equal(waitlist.kind, 'waitlist');
  assert.equal(waitlist.edition, null);
  assert.equal(resolveNewsletterPreference({ edition: 'graz' }).error, 'unsupported_edition');
});

test('the place gazetteer identifies Austrian, Bulgarian and German newsletter countries', () => {
  assert.equal(searchPlaces('Linz', { limit: 1 })[0].country, 'AT');
  assert.equal(searchPlaces('Plovdiv', { limit: 1 })[0].country, 'BG');
  assert.equal(searchPlaces('Berlin', { limit: 1 })[0].country, 'DE');
});

test('edition and waitlist choices are localized in every UI language', () => {
  for (const lang of ['de', 'en', 'bg']) {
    assert.ok(STRINGS[lang].nlEdition);
    assert.ok(STRINGS[lang].nlWaitlistOption);
    assert.ok(STRINGS[lang].nlWaitlistConfirmSent);
  }
});

test('every signup surface sends a closed edition choice and the API validates it centrally', () => {
  const popup = read('app/page.js');
  const pageSignup = read('app/newsletter-signup.js');
  const subscribe = read('app/api/subscribe/route.js');
  const eventPage = read('app/event/[id]/page.js');
  const weekendPage = read('app/weekend/[city]/[weekend]/page.js');

  assert.match(popup, /edition: nl\.edition/);
  assert.match(pageSignup, /edition,/);
  assert.match(pageSignup, /NEWSLETTER_EDITIONS/);
  assert.match(eventPage, /country: channel\.country/);
  assert.match(weekendPage, /country: channel\.country/);
  assert.match(subscribe, /resolveNewsletterPreference/);
  assert.match(subscribe, /code: 'unsupported_edition'/);
});

test('delivery is blocked for every channel without a live edition', () => {
  const route = read('app/api/admin/digest/route.js');
  const cli = read('scripts/weekly-digest.mjs');
  assert.match(route, /if \(!newsletterEdition\(channel\.slug\)\)/);
  assert.match(cli, /channels\.some\(\(channel\) => !newsletterEdition\(channel\.slug\)\)/);
  assert.match(route, /subscriber\.subscription_kind === 'edition'/);
  assert.match(route, /subscriber\.channel_slug === channel\.slug/);
});

test('geocode results carry the resolved country back to the newsletter UI', () => {
  const geocode = read('app/api/geocode/route.js');
  assert.match(geocode, /country: \(f\.properties\?\.countrycode \|\| ''\)\.toUpperCase\(\)/);
  assert.match(geocode, /result: result \? \{ \.\.\.result, country: resolvedCountry \} : null/);
});
