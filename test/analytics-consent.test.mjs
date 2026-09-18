import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsAllowed, analyticsConsent, setAnalyticsConsent, refreshAnalyticsConsent, track, sanitizeProperties, CONSENT_KEY } from '../lib/analytics.js';
import { captureServer } from '../lib/analytics-server.js';

const storage = new Map();
globalThis.localStorage = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
globalThis.window = { location: { hostname: 'okolo.events', pathname: '/', search: '?token=secret&email=test@example.com' }, dispatchEvent() {} };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const requests = [];
globalThis.fetch = async (url, options) => { requests.push({ url, ...options }); return { ok: true }; };

test('consent gates all capture; rejection and withdrawal stop it without replaying prior actions', async () => {
  assert.equal(analyticsConsent(), null);
  assert.equal(track('open_detail', { id: '123' }), false);
  assert.equal(requests.length, 0);
  setAnalyticsConsent('rejected');
  assert.equal(track('$pageview'), false);
  setAnalyticsConsent('accepted');
  assert.equal(track('$pageview', { email: 'test@example.com' }), true);
  const payload = JSON.parse(requests[0].body);
  assert.equal(payload.event, '$pageview');
  assert.equal(payload.properties.page_type, 'map');
  assert.equal(payload.properties.$process_person_profile, false);
  assert.equal(payload.properties.$geoip_disable, true);
  assert.doesNotMatch(requests[0].body, /secret|example.com|email|token|current_url|referrer/);
  assert.equal(requests[0].referrerPolicy, 'no-referrer');
  assert.equal(requests[0].credentials, 'omit');
  const firstId = payload.distinct_id;
  setAnalyticsConsent('rejected');
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(track('$pageview'), false);
  setAnalyticsConsent('accepted'); track('$pageview');
  assert.notEqual(JSON.parse(requests[1].body).distinct_id, firstId);
  assert.deepEqual([...storage.keys()], [CONSENT_KEY]);
});

test('production, automation, internal, privacy-signal and sensitive-route guards fail closed', () => {
  setAnalyticsConsent('accepted');
  for (const host of ['localhost', 'okolo.vercel.app', 'evil.okolo.events']) { window.location.hostname = host; assert.equal(analyticsAllowed(), false); }
  window.location.hostname = 'okolo.events';
  for (const flag of ['webdriver', 'globalPrivacyControl']) { navigator[flag] = true; assert.equal(analyticsAllowed(), false); delete navigator[flag]; }
  navigator.doNotTrack = '1'; assert.equal(analyticsAllowed(), false); delete navigator.doNotTrack;
  window.location.pathname = '/newsletter/preferences'; assert.equal(analyticsAllowed(), false); window.location.pathname = '/';
  window.location.search = '?okolo_internal=1'; assert.equal(analyticsAllowed(), false);
  window.location.search = ''; assert.equal(analyticsAllowed(), false);
  window.location.search = '?okolo_internal=0'; assert.equal(analyticsAllowed(), true);
  storage.set(CONSENT_KEY, 'rejected'); refreshAnalyticsConsent(); assert.equal(analyticsAllowed(), false);
});

test('event and property allowlists reject sensitive or arbitrary input', () => {
  assert.deepEqual(sanitizeProperties({ id: '42', tier: 'gold', surface: 'map', email: 'x', lat: 48.3, area: 'home', source: 'https://secret', $set: { name: 'x' }, placement: 'user text' }), { surface: 'map', tier: 'gold', id: '42' });
  assert.deepEqual(sanitizeProperties({ id: 'user:123', town: 'Linz', query: 'child' }), {});
  setAnalyticsConsent('accepted'); assert.equal(track('user@example.com', {}), false);
});

test('newsletter confirmation cannot send to PostHog without durable separate permission', async () => {
  const before = requests.length;
  assert.equal(await captureServer('newsletter_confirmed', { distinctId: 'subscriber:1' }), false);
  assert.equal(requests.length, before);
});
