import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('newsletter preferences are tokenized, same-origin and consent-versioned', () => {
  const route = read('app/api/subscribe/preferences/route.js');
  const db = read('lib/db.js');
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /resolveNewsletterPreference/);
  assert.match(route, /NL_CONSENT_VERSION/);
  assert.match(db, /WHERE token=\$\{token\} AND confirmed_at IS NOT NULL AND unsubscribed_at IS NULL/);
  assert.match(db, /subscription_kind=\$\{subscriptionKind\}/);
  assert.match(db, /channel_slug=\$\{channelSlug\}/);
});

test('signup cannot overwrite an active subscriber preference without their token', () => {
  const db = read('lib/db.js');
  assert.match(db, /subscription_kind = CASE WHEN subscribers\.confirmed_at IS NULL OR subscribers\.unsubscribed_at IS NOT NULL THEN EXCLUDED\.subscription_kind ELSE subscribers\.subscription_kind END/);
  assert.match(db, /consent_version = CASE WHEN subscribers\.confirmed_at IS NULL OR subscribers\.unsubscribed_at IS NOT NULL THEN EXCLUDED\.consent_version ELSE subscribers\.consent_version END/);
});

test('the one-time migration keeps only the Linz catchment on recurring delivery', () => {
  const migration = read('scripts/migrate-newsletter-editions.mjs');
  assert.match(migration, /subscription_kind='waitlist', channel_slug=null/);
  assert.match(migration, /subscription_kind='edition', channel_slug='linz'/);
  assert.match(migration, /ST_DWithin/);
  assert.match(migration, /40000/);
});

test('the current-subscriber campaign is authenticated and idempotent per recipient', () => {
  const route = read('app/api/admin/newsletter-preferences/route.js');
  const trigger = read('scripts/trigger-newsletter-preferences.mjs');
  assert.match(route, /bearerTokenValid/);
  assert.match(route, /newsletter-preferences-v1/);
  assert.match(route, /idempotencyKey: `\$\{CAMPAIGN\}-\$\{subscriber\.id\}`/);
  assert.match(route, /await metaSet\(doneKey/);
  assert.match(trigger, /authorization: `Bearer \$\{token\}`/);
});

test('city launch notices target confirmed waitlist rows without silently subscribing them', () => {
  const route = read('app/api/admin/newsletter-launch/route.js');
  const trigger = read('scripts/trigger-newsletter-launch.mjs');
  assert.match(route, /bearerTokenValid/);
  assert.match(route, /subscriber\.subscription_kind === 'waitlist'/);
  assert.match(route, /newsletterEditionForPoint/);
  assert.match(route, /newsletter-launch-\$\{edition\.slug\}-v1/);
  assert.match(route, /await metaSet\(doneKey/);
  assert.doesNotMatch(route, /updateSubscriberPreferences/);
  assert.match(trigger, /--channel is required/);
});
