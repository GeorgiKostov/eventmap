// Source-quality ranking for the weekend digest — pure parts only, no network,
// no DB. Run: node --test test/source-quality.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceTier, communityQualityGate, rankPick, SOURCE_TIERS } from '../lib/source-quality.js';

// ---- sourceTier ----

test('sourceTier: linztermine.at source_url -> curated (2)', () => {
  assert.equal(sourceTier({ src_kind: 'crawl', source_url: 'https://linztermine.at/event/123' }), SOURCE_TIERS.CURATED);
});

test('sourceTier: subdomain still matches (www., events.wien.gv.at)', () => {
  assert.equal(sourceTier({ src_kind: 'crawl', source_url: 'https://www.linztermine.at/event/123' }), SOURCE_TIERS.CURATED);
  assert.equal(sourceTier({ src_kind: 'crawl', source_url: 'https://events.wien.gv.at/foo' }), SOURCE_TIERS.CURATED);
});

// Review catches (2026-07-15): these two pin the REAL live shapes so a masked
// fallback can't hide a dead entry again.
test('sourceTier: ooe.familienbund.at matches by DOMAIN alone (no name fallback needed)', () => {
  assert.equal(sourceTier({ src_kind: 'crawl', source_url: 'https://ooe.familienbund.at/veranstaltungen/x', source_name: 'irrelevant' }), SOURCE_TIERS.CURATED);
});

test('sourceTier: hyphenated "Linz-Termine" source_name matches the name fallback', () => {
  assert.equal(sourceTier({ src_kind: 'crawl', source_url: 'https://example.at/e/1', source_name: 'Linz-Termine' }), SOURCE_TIERS.CURATED);
});

test('sourceTier: a lookalike domain does NOT suffix-match (xlinztermine.at)', () => {
  assert.equal(sourceTier({ src_kind: 'crawl', source_url: 'https://xlinztermine.at/e/1' }), SOURCE_TIERS.OFFICIAL);
});

test('sourceTier: source_name fallback (WIENXTRA) with an unrelated URL -> curated', () => {
  assert.equal(
    sourceTier({ src_kind: 'crawl', source_name: 'WIENXTRA', source_url: 'https://some-cms.example.com/e/1' }),
    SOURCE_TIERS.CURATED,
  );
});

test('sourceTier: plain gemeinde crawl (random .at domain) -> official (1)', () => {
  assert.equal(
    sourceTier({ src_kind: 'crawl', source_name: 'Marktgemeinde Kirchdorf', source_url: 'https://kirchdorf.gv.at/veranstaltungen/1' }),
    SOURCE_TIERS.OFFICIAL,
  );
});

test('sourceTier: user submissions (scan/link/manual) -> unvetted (0)', () => {
  assert.equal(sourceTier({ src_kind: 'user_photo' }), SOURCE_TIERS.UNVETTED);
  assert.equal(sourceTier({ src_kind: 'user_link', source_url: 'https://facebook.com/events/1' }), SOURCE_TIERS.UNVETTED);
  assert.equal(sourceTier({ src_kind: 'user_manual' }), SOURCE_TIERS.UNVETTED);
});

test('sourceTier: osm_mined -> unvetted (0)', () => {
  assert.equal(sourceTier({ src_kind: 'osm_mined', source_name: 'OpenStreetMap contributors' }), SOURCE_TIERS.UNVETTED);
});

test('sourceTier: null/missing src_kind -> unvetted (0)', () => {
  assert.equal(sourceTier({}), SOURCE_TIERS.UNVETTED);
  assert.equal(sourceTier({ src_kind: null }), SOURCE_TIERS.UNVETTED);
});

// ---- communityQualityGate ----

const goodCommunity = {
  src_kind: 'user_manual',
  venue: 'Hauptplatz',
  description: 'A real description that is definitely at least thirty characters long.',
  report_flag: null,
};

test('communityQualityGate: community with venue + real description + no report -> true', () => {
  assert.equal(communityQualityGate(goodCommunity), true);
});

test('communityQualityGate: missing venue -> false', () => {
  assert.equal(communityQualityGate({ ...goodCommunity, venue: null }), false);
  assert.equal(communityQualityGate({ ...goodCommunity, venue: '  ' }), false);
});

test('communityQualityGate: short or missing description -> false', () => {
  assert.equal(communityQualityGate({ ...goodCommunity, description: 'too short' }), false);
  assert.equal(communityQualityGate({ ...goodCommunity, description: null }), false);
});

test('communityQualityGate: report_flag set -> false', () => {
  assert.equal(communityQualityGate({ ...goodCommunity, report_flag: 'wrong_time' }), false);
});

test('communityQualityGate: gate only applies to community — a crawl event with no venue still passes', () => {
  assert.equal(communityQualityGate({ src_kind: 'crawl', venue: null, description: null }), true);
});

// ---- rankPick ----

test('rankPick: official family event outranks community family event', () => {
  const official = { categories: ['family'], src_kind: 'crawl', source_url: 'https://linztermine.at/1' };
  const community = { categories: ['family'], src_kind: 'user_manual' };
  const ra = rankPick(official), rb = rankPick(community);
  assert.ok(ra.some((v, i) => v !== rb[i]) , 'ranks must differ');
  // first differing index, ra must be greater (better) — lexicographic descending sort
  let cmp = 0;
  for (let i = 0; i < ra.length; i++) { if (ra[i] !== rb[i]) { cmp = ra[i] - rb[i]; break; } }
  assert.ok(cmp > 0, 'official family event must rank above community family event');
});

test('rankPick: family stays strictly dominant — a family community event outranks a non-family linztermine event', () => {
  const familyCommunity = { categories: ['family'], src_kind: 'user_manual' };
  const nonFamilyCurated = { categories: ['culture'], src_kind: 'crawl', source_url: 'https://linztermine.at/1' };
  const ra = rankPick(familyCommunity), rb = rankPick(nonFamilyCurated);
  assert.ok(ra[0] > rb[0], 'family bit must be first and higher');
  let cmp = 0;
  for (let i = 0; i < ra.length; i++) { if (ra[i] !== rb[i]) { cmp = ra[i] - rb[i]; break; } }
  assert.ok(cmp > 0, 'family event must outrank a higher-tier non-family event');
});

test('rankPick: interest_count breaks ties among otherwise-equal picks', () => {
  const base = { categories: ['family'], src_kind: 'crawl', source_url: 'https://linztermine.at/1', geo_precision: 'venue', is_free: true };
  const more = rankPick({ ...base, interest_count: 5 });
  const less = rankPick({ ...base, interest_count: 1 });
  assert.deepEqual(more.slice(0, 4), less.slice(0, 4), 'sanity: everything but interest_count is equal');
  assert.ok(more[4] > less[4], 'higher interest_count ranks higher');
});

test('rankPick: a reported event is excluded by the caller, not by rankPick itself (gate lives in communityQualityGate/SQL)', () => {
  // rankPick is a pure ordering function; exclusion of reported events happens
  // in weekendPicks' SQL (rr.event_id IS NULL) before ranking ever runs. This
  // test documents that communityQualityGate is the JS-side half of that gate
  // for community rows specifically.
  assert.equal(communityQualityGate({ src_kind: 'user_manual', venue: 'X', description: 'x'.repeat(40), report_flag: 'cancelled' }), false);
});
