// Meta publishing — pure parts only, no network. Run: node --test test/social-publish.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  socialConfigured,
  missingSocialEnv,
  cardUrls,
  postedKey,
  facebookMessage,
  publishInstagramCarousel,
  publishAndLedger,
} from '../lib/social-publish.js';
import { renderCaption, weekendUrl } from '../lib/digest.js';

// Snapshot + restore the handful of env vars each test touches, so tests
// never leak state into each other or into the rest of the suite.
const ENV_KEYS = ['META_ACCESS_TOKEN', 'IG_USER_ID', 'FB_PAGE_ID', 'NEXT_PUBLIC_BASE_URL'];
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

test('socialConfigured: nothing set → both false', () => {
  withEnv({}, () => {
    assert.deepEqual(socialConfigured(), { instagram: false, facebook: false });
  });
});

test('socialConfigured: token alone is not enough for either target', () => {
  withEnv({ META_ACCESS_TOKEN: 'tok' }, () => {
    assert.deepEqual(socialConfigured(), { instagram: false, facebook: false });
  });
});

test('socialConfigured: token + IG_USER_ID → instagram only', () => {
  withEnv({ META_ACCESS_TOKEN: 'tok', IG_USER_ID: '123' }, () => {
    assert.deepEqual(socialConfigured(), { instagram: true, facebook: false });
  });
});

test('socialConfigured: token + FB_PAGE_ID → facebook only', () => {
  withEnv({ META_ACCESS_TOKEN: 'tok', FB_PAGE_ID: '456' }, () => {
    assert.deepEqual(socialConfigured(), { instagram: false, facebook: true });
  });
});

test('socialConfigured: all three set → both true', () => {
  withEnv({ META_ACCESS_TOKEN: 'tok', IG_USER_ID: '123', FB_PAGE_ID: '456' }, () => {
    assert.deepEqual(socialConfigured(), { instagram: true, facebook: true });
  });
});

test('missingSocialEnv names the exact vars, per target', () => {
  withEnv({}, () => {
    assert.deepEqual(missingSocialEnv('instagram'), ['META_ACCESS_TOKEN', 'IG_USER_ID']);
    assert.deepEqual(missingSocialEnv('facebook'), ['META_ACCESS_TOKEN', 'FB_PAGE_ID']);
  });
  withEnv({ META_ACCESS_TOKEN: 'tok' }, () => {
    assert.deepEqual(missingSocialEnv('instagram'), ['IG_USER_ID']);
    assert.deepEqual(missingSocialEnv('facebook'), ['FB_PAGE_ID']);
  });
  withEnv({ META_ACCESS_TOKEN: 'tok', IG_USER_ID: '1', FB_PAGE_ID: '2' }, () => {
    assert.deepEqual(missingSocialEnv('instagram'), []);
    assert.deepEqual(missingSocialEnv('facebook'), []);
  });
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

test('publishInstagramCarousel: rejects an over-limit caption BEFORE any network call', async () => {
  await assert.rejects(
    () => publishInstagramCarousel({ imageUrls: ['https://x/1', 'https://x/2'], caption: 'x'.repeat(2201) }),
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
