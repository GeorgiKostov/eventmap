// Meta publishing — pure parts only, no network. Run: node --test test/social-publish.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  socialConfigured,
  missingSocialConfig,
  cardUrls,
  postedKey,
  facebookMessage,
  publishInstagramCarousel,
  publishFacebookPost,
  publishAndLedger,
  itemPostedKey,
  itemSlide,
  cardUrlForItem,
  nextUnpostedItem,
  publishItemAndLedger,
  itemsAlreadyPosted,
} from '../lib/social-publish.js';
import { renderCaption, renderItemCaption, weekendUrl } from '../lib/digest.js';

// Snapshot + restore the handful of env vars each test touches, so tests
// never leak state into each other or into the rest of the suite. The Meta ids
// are NOT env any more (they're per-channel, in lib/city-channels.js) — only the
// shared token is.
const ENV_KEYS = ['META_ACCESS_TOKEN', 'NEXT_PUBLIC_BASE_URL'];
function withEnv(vars, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const BOTH = { slug: 'both', fbPageId: '456', igUserId: '123' };
const FB_ONLY = { slug: 'fbonly', fbPageId: '456', igUserId: null };

test('socialConfigured: no token → both false even with ids', () => {
  withEnv({}, () => {
    assert.deepEqual(socialConfigured(BOTH), { instagram: false, facebook: false });
  });
});

test('socialConfigured: token alone is not enough — a channel with no ids posts nowhere', () => {
  withEnv({ META_ACCESS_TOKEN: 'tok' }, () => {
    assert.deepEqual(socialConfigured({ slug: 'bare', fbPageId: null, igUserId: null }), {
      instagram: false,
      facebook: false,
    });
  });
});

test('socialConfigured: is per-channel — Page but no IG → facebook only', () => {
  withEnv({ META_ACCESS_TOKEN: 'tok' }, () => {
    assert.deepEqual(socialConfigured(FB_ONLY), { instagram: false, facebook: true });
  });
});

test('socialConfigured: token + both ids → both true', () => {
  withEnv({ META_ACCESS_TOKEN: 'tok' }, () => {
    assert.deepEqual(socialConfigured(BOTH), { instagram: true, facebook: true });
  });
});

test('missingSocialConfig names the token AND the per-channel field, per target', () => {
  withEnv({}, () => {
    assert.deepEqual(missingSocialConfig('instagram', FB_ONLY), [
      'META_ACCESS_TOKEN',
      "igUserId for 'fbonly' in lib/city-channels.js",
    ]);
  });
  withEnv({ META_ACCESS_TOKEN: 'tok' }, () => {
    assert.deepEqual(missingSocialConfig('instagram', FB_ONLY), [
      "igUserId for 'fbonly' in lib/city-channels.js",
    ]);
    assert.deepEqual(missingSocialConfig('facebook', FB_ONLY), []);
    assert.deepEqual(missingSocialConfig('instagram', BOTH), []);
    assert.deepEqual(missingSocialConfig('facebook', BOTH), []);
  });
});

// The regression that motivated per-channel ids: the ids used to come from flat
// env, so publishing a Vienna digest posted it to the LINZ accounts and reported
// success. A channel missing an id must FAIL — the one thing it must never do is
// quietly find some other city's account and post there.
// No withEnv here: the guard is deliberately env-independent, so it refuses
// before a token is ever consulted (withEnv restores synchronously and would not
// span these awaits anyway).
test('publish refuses a channel with no id rather than falling back to another city', async () => {
  await assert.rejects(
    () => publishInstagramCarousel({ channel: FB_ONLY, imageUrls: ['https://x/1'], caption: 'hi' }),
    /has no igUserId/,
  );
  await assert.rejects(
    () => publishFacebookPost({ channel: { slug: 'nopage', fbPageId: null }, imageUrls: ['https://x/1'], message: 'hi' }),
    /has no fbPageId/,
  );
});

test('cardUrls: cover + one per item, weekend pinned, base from env', () => {
  withEnv({ NEXT_PUBLIC_BASE_URL: 'https://okolo.events' }, () => {
    const channel = { slug: 'linz' };
    const digest = { window: { friday: '2026-07-17' }, items: [{ id: '1' }, { id: '2' }, { id: '3' }] };
    const urls = cardUrls(channel, digest);
    assert.equal(urls.length, 4); // cover + 3 items
    assert.equal(urls[0], 'https://okolo.events/api/social/card?channel=linz&slide=0&weekend=2026-07-17');
    assert.equal(urls[3], 'https://okolo.events/api/social/card?channel=linz&slide=3&weekend=2026-07-17');
  });
});

test('cardUrls: explicit base overrides env and strips a trailing slash', () => {
  const channel = { slug: 'wien' };
  const digest = { window: { friday: '2026-07-17' }, items: [] };
  const urls = cardUrls(channel, digest, 'http://localhost:3311/');
  assert.deepEqual(urls, ['http://localhost:3311/api/social/card?channel=wien&slide=0&weekend=2026-07-17']);
});

test('cardUrls: capped at 10 images even if a digest somehow carries more', () => {
  const channel = { slug: 'linz' };
  const digest = {
    window: { friday: '2026-07-17' },
    items: Array.from({ length: 15 }, (_, i) => ({ id: String(i) })),
  };
  const urls = cardUrls(channel, digest, 'https://okolo.events');
  assert.equal(urls.length, 10);
});

test('postedKey: instagram and facebook get distinct, stable keys', () => {
  assert.equal(postedKey('instagram', 'linz', '2026-07-17'), 'posted:ig:linz:2026-07-17');
  assert.equal(postedKey('facebook', 'linz', '2026-07-17'), 'posted:fb:linz:2026-07-17');
});

// renderCaption() already ends with the weekend URL (its captionOutro line) —
// facebookMessage() must not print it a second time. This is the regression
// caught while manually verifying the route's dry-run output.
const fixtureDigest = {
  channel: { slug: 'linz', label: 'Linz', handle: 'okolo.linz', lang: 'de', hashtags: ['#linz'] },
  window: { friday: '2026-07-17', sunday: '2026-07-19', from: '2026-07-17', to: '2026-07-19' },
  label: '17.–19. Juli',
  items: [{ id: '1', title: 'Test Event', when: 'Fr 17.7.', venue: 'Hauptplatz', badges: ['gratis'] }],
};

test('facebookMessage: appends the weekend link exactly once', () => {
  const msg = facebookMessage(fixtureDigest);
  const link = weekendUrl(fixtureDigest);
  const occurrences = msg.split(link).length - 1;
  assert.equal(occurrences, 1, `expected exactly one occurrence of ${link}, got ${occurrences}`);
});

test('facebookMessage: matches renderCaption when the caption already carries the link (no double-append)', () => {
  const caption = renderCaption(fixtureDigest);
  assert.ok(caption.includes(weekendUrl(fixtureDigest)), 'sanity: renderCaption embeds the weekend URL');
  assert.equal(facebookMessage(fixtureDigest), caption);
});

// Channel is a fully-configured one on purpose: with no igUserId the id guard
// would reject first and this would pass without ever reaching the caption check.
test('publishInstagramCarousel: rejects an over-limit caption BEFORE any network call', async () => {
  await assert.rejects(
    () => publishInstagramCarousel({ channel: BOTH, imageUrls: ['https://x/1', 'https://x/2'], caption: 'x'.repeat(2201) }),
    /2200/,
  );
});

// publishAndLedger's guard rails run before any Graph call, so an in-memory
// meta store exercises them without network. The fixture channel/digest reuse
// the caption fixture above.
function memMeta(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    metaGet: async (k) => store.get(k) ?? null,
    metaSet: async (k, v) => void store.set(k, v),
    metaClaim: async (k, v) => (store.has(k) ? false : (store.set(k, v), true)),
    metaDelete: async (k) => void store.delete(k),
  };
}
const pubArgs = { channel: fixtureDigest.channel, digest: fixtureDigest, target: 'instagram' };

test('publishAndLedger: existing success ledger → ALREADY_POSTED without touching Meta', async () => {
  const m = memMeta({ 'posted:ig:linz:2026-07-17': JSON.stringify({ id: '1', at: 'x' }) });
  await assert.rejects(() => publishAndLedger({ ...pubArgs, ...m }), (err) => err.code === 'ALREADY_POSTED');
});

test('publishAndLedger: fresh in-flight claim → PUBLISH_IN_FLIGHT', async () => {
  const m = memMeta({ 'posted:ig:linz:2026-07-17:inflight': JSON.stringify({ at: new Date().toISOString() }) });
  await assert.rejects(() => publishAndLedger({ ...pubArgs, ...m }), (err) => err.code === 'PUBLISH_IN_FLIGHT');
});

test('publishAndLedger: stale in-flight claim → UNKNOWN_OUTCOME (post may be live, demand a human look)', async () => {
  const m = memMeta({ 'posted:ig:linz:2026-07-17:inflight': JSON.stringify({ at: new Date(Date.now() - 10 * 60_000).toISOString() }) });
  await assert.rejects(() => publishAndLedger({ ...pubArgs, ...m }), (err) => err.code === 'UNKNOWN_OUTCOME');
});

test('publishAndLedger: a thrown publish releases the claim (only a hard kill leaves it)', async () => {
  const m = memMeta();
  await assert.rejects(() => publishAndLedger({ ...pubArgs, target: 'not-a-target', ...m }), /unknown target/);
  assert.equal(m.store.size, 0, 'claim must be released on failure, nothing else written');
});

// ---- per-item (individual photo) publishing ----

test('itemPostedKey: instagram and facebook get distinct, stable per-event keys', () => {
  assert.equal(itemPostedKey('instagram', 'linz', '2026-07-17', '42'), 'posted:ig:linz:2026-07-17:ev:42');
  assert.equal(itemPostedKey('facebook', 'linz', '2026-07-17', '42'), 'posted:fb:linz:2026-07-17:ev:42');
});

const multiItemDigest = {
  channel: { slug: 'linz', label: 'Linz', handle: 'okolo.linz', lang: 'de', hashtags: ['#linz'] },
  window: { friday: '2026-07-17', sunday: '2026-07-19', from: '2026-07-17', to: '2026-07-19' },
  label: '17.–19. Juli',
  items: [
    { id: '1', title: 'Erstes Event', when: 'Fr 17.7.', venue: 'Hauptplatz', badges: ['gratis'], teaser: 'Ein toller Auftakt.' },
    { id: '2', title: 'Zweites Event', when: 'Sa 18.7.', venue: '', badges: [] },
    { id: '3', title: 'Drittes Event', when: 'So 19.7.', venue: 'Donaupark', badges: [] },
  ],
};

test('itemSlide: 1-based index of the item within digest.items, throws if absent', () => {
  assert.equal(itemSlide(multiItemDigest, { id: '1' }), 1);
  assert.equal(itemSlide(multiItemDigest, { id: '3' }), 3);
  assert.throws(() => itemSlide(multiItemDigest, { id: 'not-there' }), /not in this digest/);
});

test('cardUrlForItem: addresses the card by EVENT ID (drift-proof), weekend pinned', () => {
  const url = cardUrlForItem(multiItemDigest.channel, multiItemDigest, multiItemDigest.items[1], 'https://okolo.events');
  // event=<id>, NOT slide=<n>: a Regenerate can move an event to a different
  // slide, but the id still resolves to the right card (or 404s).
  assert.equal(url, 'https://okolo.events/api/social/card?channel=linz&event=2&weekend=2026-07-17');
});

test('nextUnpostedItem: first item not in the posted set', () => {
  const postedIds = new Set(['1']);
  const next = nextUnpostedItem(multiItemDigest, 'instagram', postedIds);
  assert.equal(next.id, '2');
});

test('nextUnpostedItem: null once every item is posted', () => {
  const postedIds = new Set(['1', '2', '3']);
  assert.equal(nextUnpostedItem(multiItemDigest, 'instagram', postedIds), null);
});

test('renderItemCaption: appends the weekend link exactly once', () => {
  const caption = renderItemCaption(multiItemDigest, multiItemDigest.items[0]);
  const link = weekendUrl(multiItemDigest);
  const occurrences = caption.split(link).length - 1;
  assert.equal(occurrences, 1, `expected exactly one occurrence of ${link}, got ${occurrences}`);
  assert.ok(caption.includes('📍 Erstes Event'), 'leads with the event title');
  assert.ok(caption.includes('Ein toller Auftakt.'), 'includes the item\'s own teaser, not invented text');
});

test('publishItemAndLedger: existing per-item ledger → ALREADY_POSTED, no double-post', async () => {
  const item = multiItemDigest.items[0];
  const key = itemPostedKey('instagram', multiItemDigest.channel.slug, multiItemDigest.window.friday, item.id);
  const m = memMeta({ [key]: JSON.stringify({ id: 'ig1', at: 'x' }) });
  await assert.rejects(
    () => publishItemAndLedger({ channel: multiItemDigest.channel, digest: multiItemDigest, item, target: 'instagram', ...m }),
    (err) => err.code === 'ALREADY_POSTED',
  );
});

test('publishItemAndLedger: posting one event never touches another event\'s ledger key', async () => {
  const itemA = multiItemDigest.items[0];
  const itemB = multiItemDigest.items[1];
  const keyA = itemPostedKey('instagram', multiItemDigest.channel.slug, multiItemDigest.window.friday, itemA.id);
  const keyB = itemPostedKey('instagram', multiItemDigest.channel.slug, multiItemDigest.window.friday, itemB.id);
  // itemA already posted; posting itemB must not see itemA's ledger as its own,
  // and must fail cleanly (no network in tests) without writing itemA's key.
  const m = memMeta({ [keyA]: JSON.stringify({ id: 'ig1', at: 'x' }) });
  await assert.rejects(() => publishItemAndLedger({ channel: multiItemDigest.channel, digest: multiItemDigest, item: itemB, target: 'not-a-target', ...m }));
  assert.ok(m.store.has(keyA), 'itemA ledger untouched');
  assert.ok(!m.store.has(keyB), 'itemB ledger not written on failure');
});

// ---- cross-ledger dedup: carousel <-> individual never silently double-post ----

test('publishItemAndLedger: refuses when the carousel already went out (ALREADY_IN_CAROUSEL)', async () => {
  const item = multiItemDigest.items[0];
  const bulkKey = postedKey('instagram', multiItemDigest.channel.slug, multiItemDigest.window.friday);
  const m = memMeta({ [bulkKey]: JSON.stringify({ id: 'carousel1', permalink: 'p', at: 'x' }) });
  await assert.rejects(
    () => publishItemAndLedger({ channel: multiItemDigest.channel, digest: multiItemDigest, item, target: 'instagram', ...m }),
    (err) => err.code === 'ALREADY_IN_CAROUSEL',
  );
  // force is the deliberate override — it must get PAST the cross-check (and then
  // fail only at the network boundary, which we simulate with a bad target).
  await assert.rejects(
    () => publishItemAndLedger({ channel: multiItemDigest.channel, digest: multiItemDigest, item, target: 'not-a-target', force: true, ...m }),
    (err) => err.code !== 'ALREADY_IN_CAROUSEL',
  );
});

test('publishAndLedger: refuses when events were already posted individually (ITEMS_ALREADY_POSTED)', async () => {
  const item = multiItemDigest.items[1];
  const key = itemPostedKey('instagram', multiItemDigest.channel.slug, multiItemDigest.window.friday, item.id);
  const m = memMeta({ [key]: JSON.stringify({ id: 'ig2', at: 'x' }) });
  await assert.rejects(
    () => publishAndLedger({ channel: multiItemDigest.channel, digest: multiItemDigest, target: 'instagram', ...m }),
    (err) => err.code === 'ITEMS_ALREADY_POSTED' && err.ids.includes('2'),
  );
});

test('itemsAlreadyPosted: lists only the events with their own per-item ledger', async () => {
  const k1 = itemPostedKey('facebook', 'linz', '2026-07-17', '1');
  const k3 = itemPostedKey('facebook', 'linz', '2026-07-17', '3');
  const m = memMeta({ [k1]: '{}', [k3]: '{}' });
  const ids = await itemsAlreadyPosted({ channel: multiItemDigest.channel, digest: multiItemDigest, target: 'facebook', metaGet: m.metaGet });
  assert.deepEqual(ids.sort(), ['1', '3']);
});
