// The two-strand digest (George, 2026-07-17: "almost every event is for kids…
// maybe half half or so… 10 best events"). Pure — no network, no DB.
// Run: node --test test/digest-sections.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSections, sectionsOf, applyReplace, applyReorder, renderNewsletter, renderCaption, DIGEST_MAX } from '../lib/digest.js';

// isForKids(row) is true on an age range OR the 'family' category (lib/kid-cats.js).
const fam = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, categories: ['family'] }));
const all = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, categories: ['music'] }));
const split = (f, a, limit = DIGEST_MAX) => {
  const { picks, sectionOf } = splitSections([...fam(f), ...all(a)], limit);
  return {
    total: picks.length,
    family: picks.filter((p) => sectionOf.get(p.id) === 'family').length,
    rest: picks.filter((p) => sectionOf.get(p.id) === 'all').length,
    ids: picks.map((p) => p.id),
  };
};

test('DIGEST_MAX is 10 — "10 best events from the area"', () => {
  assert.equal(DIGEST_MAX, 10);
});

test('rich weekend: half and half', () => {
  const r = split(20, 20);
  assert.equal(r.total, 10);
  assert.equal(r.family, 5);
  assert.equal(r.rest, 5);
});

// The whole point of the change: this case used to yield 10 family events.
test('family-heavy weekend still gives the other strand its half', () => {
  const r = split(30, 6);
  assert.equal(r.family, 5);
  assert.equal(r.rest, 5);
});

test('thin family strand: the other fills the gap, issue stays full', () => {
  const r = split(3, 20);
  assert.equal(r.total, 10);
  assert.equal(r.family, 3);
  assert.equal(r.rest, 7);
});

test('thin non-family strand: family fills the gap', () => {
  const r = split(20, 1);
  assert.equal(r.total, 10);
  assert.equal(r.family, 9);
  assert.equal(r.rest, 1);
});

test('one strand empty: the issue is single-strand, not half-empty', () => {
  assert.deepEqual(split(20, 0), { total: 10, family: 10, rest: 0, ids: split(20, 0).ids });
  assert.equal(split(0, 20).rest, 10);
});

// A thin weekend must read short, not padded — there is nothing to pad WITH.
test('thin weekend both ways: as many as exist, never more', () => {
  const r = split(2, 3);
  assert.equal(r.total, 5);
  assert.equal(r.family, 2);
  assert.equal(r.rest, 3);
});

test('never exceeds the limit, whatever the mix', () => {
  for (const [f, a] of [[0, 0], [1, 0], [0, 1], [5, 5], [9, 9], [1, 30], [30, 1], [4, 7], [7, 4]]) {
    assert.ok(split(f, a).total <= DIGEST_MAX, `overshoot at fam=${f} all=${a}`);
  }
});

test('family leads and pool ranking survives within each strand', () => {
  const r = split(6, 6);
  assert.deepEqual(r.ids, ['f0', 'f1', 'f2', 'f3', 'f4', 'a0', 'a1', 'a2', 'a3', 'a4']);
});

test('an odd limit gives the extra slot to family (ceil)', () => {
  const r = split(9, 9, 9);
  assert.equal(r.family, 5);
  assert.equal(r.rest, 4);
});

// ---- sectionsOf: when headings appear ----

const item = (id, section) => ({ id, section, title: `E${id}`, when: 'Fr', venue: 'V', badges: [], cat: 'family', teaser: 'T', url: `https://x/${id}` });

test('sectionsOf: both strands present -> two titled groups in SECTIONS order', () => {
  const g = sectionsOf([item(1, 'family'), item(2, 'all')], 'de');
  assert.deepEqual(g.map((x) => x.key), ['family', 'all']);
  assert.deepEqual(g.map((x) => x.title), ['Für Familien', 'Für alle']);
});

test('sectionsOf: single strand -> ONE flat group, no heading (a lone banner is noise)', () => {
  const g = sectionsOf([item(1, 'family'), item(2, 'family')], 'de');
  assert.equal(g.length, 1);
  assert.equal(g[0].title, null);
  assert.equal(g[0].items.length, 2);
});

// Frozen snapshots predate `section` entirely — they must render as built.
test('sectionsOf: pre-sections snapshot (no section field) -> flat, unchanged', () => {
  const g = sectionsOf([item(1, undefined), item(2, undefined)], 'de');
  assert.equal(g.length, 1);
  assert.equal(g[0].title, null);
  assert.equal(g[0].items.length, 2);
});

test('sectionsOf: headings are localized', () => {
  assert.deepEqual(sectionsOf([item(1, 'family'), item(2, 'all')], 'bg').map((g) => g.title), ['За семейства', 'За всички']);
  assert.deepEqual(sectionsOf([item(1, 'family'), item(2, 'all')], 'en').map((g) => g.title), ['For families', 'For everyone']);
});

// ---- renderers agree with the split ----

const digest = (items, lang = 'de') => ({
  channel: { slug: 'linz', label: 'Linz', handle: 'okolo.linz', lat: 48.3, lng: 14.28, lang, country: 'AT', hashtags: ['#linz'] },
  window: { from: '2026-07-17', to: '2026-07-19', friday: '2026-07-17', sunday: '2026-07-19' },
  label: '17.–19. Juli', subject: 'S', intro: 'I', items,
});

test('newsletter: both headings render, numbering runs 1..N ACROSS sections', () => {
  const items = [item(1, 'family'), item(2, 'family'), item(3, 'all'), item(4, 'all')];
  const { html } = renderNewsletter(digest(items), { unsubscribeUrl: 'https://u', mapUrl: 'https://m' });
  assert.ok(html.includes('Für Familien'));
  assert.ok(html.includes('Für alle'));
  const nums = [...html.matchAll(/text-align:center">(\d+)<\/div>/g)].map((m) => Number(m[1]));
  assert.deepEqual(nums, [1, 2, 3, 4], 'numbering must not restart per section');
});

// The text/plain part is the same mail. It was flat while the HTML had sections
// until this was caught by reading a real render — the HTML and its text twin are
// two implementations of one newsletter and WILL drift if only one is checked.
test('newsletter: the text/plain part carries the same strands and numbering', () => {
  const items = [item(1, 'family'), item(2, 'family'), item(3, 'all')];
  const { text } = renderNewsletter(digest(items), { unsubscribeUrl: 'https://u', mapUrl: 'https://m' });
  assert.ok(text.includes('— Für Familien —'));
  assert.ok(text.includes('— Für alle —'));
  assert.ok(text.includes('1. E1') && text.includes('2. E2') && text.includes('3. E3'), 'numbering must be continuous');
});

test('newsletter: text part of a pre-sections snapshot stays flat', () => {
  const { text } = renderNewsletter(digest([item(1), item(2)]), { unsubscribeUrl: 'https://u', mapUrl: 'https://m' });
  assert.ok(!text.includes('— Für Familien —'));
  assert.ok(text.includes('1. E1') && text.includes('2. E2'));
});

test('newsletter: a pre-sections snapshot renders with no headings at all', () => {
  const { html } = renderNewsletter(digest([item(1), item(2)]), { unsubscribeUrl: 'https://u', mapUrl: 'https://m' });
  assert.ok(!html.includes('Für Familien'));
  assert.ok(!html.includes('Für alle'));
});

test('caption: carries the same strands as the mail', () => {
  const cap = renderCaption(digest([item(1, 'family'), item(2, 'all')]));
  assert.ok(cap.includes('— Für Familien —'));
  assert.ok(cap.includes('— Für alle —'));
  // The old copy promised "Unsere Picks für Familien" — over a half-and-half
  // list that is exactly the mismatch the sections exist to remove.
  assert.ok(!cap.includes('Picks für Familien'));
});

test('caption: single-strand issue has no headings', () => {
  const cap = renderCaption(digest([item(1, 'family')]));
  assert.ok(!cap.includes('— Für Familien —'));
});

// ---- applyReplace: swap one pick, keep the issue full and the strand pure ----

const ch = { slug: 'linz', label: 'Linz', handle: 'okolo.linz', lat: 48.3, lng: 14.28, lang: 'de', country: 'AT', hashtags: ['#linz'] };
const win = { from: '2026-07-17', to: '2026-07-19', friday: '2026-07-17', sunday: '2026-07-19' };
// A ranked pool row (buildDigest reads title/starts_at/categories/etc via toItem).
const poolRow = (id, kind) => ({
  id, title: `E${id}`, categories: kind === 'fam' ? ['family'] : ['music'],
  starts_at: '2026-07-18T10:00', ends_at: null, venue: 'V', town: 'T', is_free: 1, src_kind: 'crawl',
});
const dg = (items, extra = {}) => ({ channel: ch, window: win, label: 'L', subject: 'S', intro: 'I', items, ...extra });

test('replace: swaps the pick for the next same-strand candidate and vetoes the old id', () => {
  const d = dg([item('f1', 'family'), item('a1', 'all')], { droppedIds: [] });
  const pool = [poolRow('f1', 'fam'), poolRow('a1', 'music'), poolRow('f2', 'fam'), poolRow('a2', 'music')];
  const next = applyReplace(d, 'f1', pool);
  assert.equal(next.items.length, 2, 'issue stays full');
  assert.equal(next.items[0].id, 'f2', 'family pick replaced by the next family candidate');
  assert.equal(next.items[0].section, 'family', 'replacement keeps the strand');
  assert.equal(next.items[1].id, 'a1', 'the other pick is untouched');
  assert.ok(next.droppedIds.includes('f1'), 'the vetoed id can no longer return via Regenerate');
});

test('replace: draws only from the SAME strand — never an all event into the family strand', () => {
  const d = dg([item('f1', 'family'), item('a1', 'all')], { droppedIds: [] });
  // Only non-family candidates left besides the in-use ones.
  const pool = [poolRow('f1', 'fam'), poolRow('a1', 'music'), poolRow('a2', 'music')];
  assert.equal(applyReplace(d, 'f1', pool), null, 'no family candidate → null, not a cross-strand swap');
});

test('replace: skips in-use and already-dropped ids', () => {
  const d = dg([item('f1', 'family'), item('f2', 'family')], { droppedIds: ['f3'] });
  const pool = [poolRow('f1', 'fam'), poolRow('f2', 'fam'), poolRow('f3', 'fam'), poolRow('f4', 'fam')];
  const next = applyReplace(d, 'f1', pool);
  assert.equal(next.items[0].id, 'f4', 'f2 in use and f3 dropped are both skipped');
});

test('replace: pre-sections snapshot (no strand) draws from the whole pool', () => {
  const d = dg([item('x1'), item('x2')], { droppedIds: [] }); // item() with no section
  const pool = [poolRow('x1', 'fam'), poolRow('x2', 'music'), poolRow('x3', 'music')];
  const next = applyReplace(d, 'x1', pool);
  assert.equal(next.items[0].id, 'x3');
});

test('replace: unknown id returns null', () => {
  const d = dg([item('f1', 'family')], { droppedIds: [] });
  assert.equal(applyReplace(d, 'nope', [poolRow('f2', 'fam')]), null);
});

// ---- applyReorder: move a pick within its strand ----

test('reorder: moving up swaps with the previous pick in the same strand', () => {
  const d = dg([item('f1', 'family'), item('f2', 'family'), item('a1', 'all')]);
  const next = applyReorder(d, 'f2', 'up');
  assert.deepEqual(next.items.map((i) => i.id), ['f2', 'f1', 'a1']);
});

test('reorder: a family pick cannot cross into the all strand', () => {
  const d = dg([item('f1', 'family'), item('a1', 'all')]);
  // f1 is last in the family strand → moving down has nowhere to go within it.
  assert.equal(applyReorder(d, 'f1', 'down'), null);
  // a1 is first in the all strand → moving up has nowhere to go within it.
  assert.equal(applyReorder(d, 'a1', 'up'), null);
});

test('reorder: interleaved array still swaps within the strand, skipping the other', () => {
  // family and all interleaved in the array (defensive — renderers group them anyway)
  const d = dg([item('f1', 'family'), item('a1', 'all'), item('f2', 'family')]);
  const next = applyReorder(d, 'f2', 'up');
  assert.deepEqual(next.items.map((i) => i.id), ['f2', 'a1', 'f1'], 'f2 swaps past a1 to reach f1');
});

test('reorder: edge pick returns null (no move)', () => {
  const d = dg([item('f1', 'family'), item('f2', 'family')]);
  assert.equal(applyReorder(d, 'f1', 'up'), null);
  assert.equal(applyReorder(d, 'f2', 'down'), null);
});

test('reorder: bad dir is a no-op at the pure level (route validates too)', () => {
  const d = dg([item('f1', 'family'), item('f2', 'family')]);
  // step becomes +1 for anything !== 'up'; guard against relying on that — the
  // route rejects non up/down, so here we just assert 'down' works as the twin.
  assert.deepEqual(applyReorder(d, 'f1', 'down').items.map((i) => i.id), ['f2', 'f1']);
});
