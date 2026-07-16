// Crawl-time fuzzy dedup (scripts/crawl.mjs's tryFuzzyMerge, wired 2026-07-16):
// exercises the exact scenario the crawl wiring exists for — a cross-source
// near-duplicate that content_hash misses because the two sources phrase the
// title differently. Pure logic only (findDuplicate/mergePlan, lib/dedup.js);
// the DB-touching bounded query (lib/db.js dedupCandidates) is verified
// read-only against the live DB separately, not here.
// Run: node --test test/crawl-fuzzy-dedup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicate, mergePlan, titleSubstitution } from '../lib/dedup.js';

test('a municipality recrawl and an aggregator listing of the same event collapse via fuzzy dedup', () => {
  // The row already published (e.g. from an aggregator, sparse facts).
  const existing = {
    id: 42, kind: 'event', title: 'Sommerfest der Musikschule',
    starts_at: '2026-08-14T18:00', all_day: false,
    town: 'Enns', lat: 48.2, lng: 14.48, geo_precision: 'venue',
    description: null, address: null, venue: 'Musikschule Enns',
    is_free: null, age_min: null, age_max: null, indoor: null, photo_path: null,
    source_name: 'Aggregator XY', source_url: 'https://aggregator.example/1',
  };
  // A brand-new crawl candidate (e.g. Gemini re-extraction of the municipality's
  // own page) — differently worded title (the municipality appends its own
  // name, the aggregator didn't), same real-world occurrence, and it carries
  // facts the first row never had.
  const candidate = {
    title: 'Sommerfest der Musikschule Enns', starts_at: '2026-08-14T18:00',
    all_day: false, town: 'Enns', lat: 48.2, lng: 14.48, geo_precision: 'venue',
    description: 'Sommerfest mit Musik und Kuchen.', address: 'Hauptplatz 3',
    venue: 'Musikschule Enns', is_free: true, age_min: null, age_max: null, indoor: null,
    source_name: 'Stadtgemeinde Enns', source_url: 'https://enns.at/events/42',
  };

  const match = findDuplicate(candidate, [existing]);
  assert.equal(match, existing, 'differently-worded titles for the same day/venue must still cluster');

  const patch = mergePlan(match, candidate);
  assert.equal(patch.description, candidate.description, 'a missing description gets filled in');
  assert.equal(patch.address, candidate.address, 'a missing address gets filled in');
  assert.equal(patch.is_free, candidate.is_free, 'a missing is_free gets filled in');
  // Enrich-only: source attribution is never touched by the patch, so the
  // FIRST-SEEN row's linkback survives the merge untouched.
  assert.equal(patch.source_url, undefined);
  assert.equal(patch.source_name, undefined);
  assert.equal(patch.venue, undefined, 'a field the existing row already had is never overwritten');
});

test('two sources disagreeing on start time are NOT a duplicate — never merge different facts', () => {
  const existing = {
    id: 1, kind: 'event', title: 'Herbstmarkt', starts_at: '2026-10-03T09:00',
    all_day: false, town: 'Traun', lat: 48.22, lng: 14.24, geo_precision: 'venue',
  };
  // Same title/day, but a genuinely different published start time.
  const candidate = {
    title: 'Herbstmarkt Traun', starts_at: '2026-10-03T14:00',
    all_day: false, town: 'Traun', lat: 48.22, lng: 14.24, geo_precision: 'venue',
  };
  assert.equal(findDuplicate(candidate, [existing]), null);
});

test('substitution guard: templated titles naming different districts must NOT auto-merge', () => {
  // Real pair from the live DB (2026-07-16 dry run): different Wien districts,
  // same boilerplate template, both date-only at town precision — titlesMatch
  // clears Jaccard 0.75, so only the substitution shape tells them apart.
  const a = '"Josefstadt spielt" 2026 - Kostenlose Veranstaltungen im Sommer';
  const b = '"Meidling spielt" 2026 - Kostenlose Veranstaltungen im Sommer';
  assert.equal(titleSubstitution(a, b), true, 'substituted content word ⇒ different events, bail');

  // The legitimate cross-source shape: one side EXTENDS the other.
  const short = 'Imagine – A Modern Mime Tale';
  const long = 'Imagine - A Modern Mime Tale - Kultursommer Wien';
  assert.equal(titleSubstitution(short, long), false, 'one-sided extension ⇒ same event, merge allowed');
  assert.equal(titleSubstitution(short, short), false, 'identical titles are never a substitution');
});

test('mergePlan never overwrites an existing fact with a conflicting one', () => {
  const existing = {
    starts_at: '2026-08-14T18:00', description: 'Original description.', venue: 'Musikschule Enns', ends_at: null,
  };
  const candidate = { starts_at: '2026-08-14T18:00', description: 'A different description entirely.', venue: 'Somewhere else' };
  const patch = mergePlan(existing, candidate);
  assert.equal(patch.description, undefined, 'existing description is never replaced');
  assert.equal(patch.venue, undefined, 'existing venue is never replaced');
});
