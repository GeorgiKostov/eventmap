// Weekend-pick editorial policy (lib/pick-policy.js). Cases are real rows from
// the 2026-11-12 audit, where the Linz family strand was five climbing courses.
// Run: node --test test/pick-policy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRoutine, isAdminNotice, isFamilyPick, isOccasion, titleKey, takeDiverse, pickFlags } from '../lib/pick-policy.js';
import { rankPick } from '../lib/source-quality.js';
import { splitSections } from '../lib/digest.js';

const ev = (title, starts_at, ends_at = null, extra = {}) => ({ title, starts_at, ends_at, categories: ['family'], ...extra });
const cmp = (a, b) => { const ra = rankPick(a), rb = rankPick(b); for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]; return 0; };

const course = ev('KK Kletterkurs Kinder 7-9 Jahre Termin 2', '2026-10-08T15:15', '2027-02-11T16:45', { source_name: 'Alpenverein Linz — Jugend', geo_precision: 'venue', venue: 'Kletterzentrum AM TURM', age_min: 7 });
const theatre = ev('Bei der Feuerwehr wird der Kaffee kalt', '2026-11-15T16:00', null, { source_name: 'Theater des Kindes — Spielplan', src_kind: 'crawl', geo_precision: 'venue', venue: 'Theater des Kindes' });

test('series courses, trainings and services are routine; one-off workshops are not', () => {
  for (const e of [course,
    ev('Familienklettertreff', '2026-10-03T10:00', '2027-07-10T12:00'),
    ev('Lehrgang Pädagogische Assistenzkraft Linz', '2026-10-15T15:00', '2027-04-06T19:30'),
    ev('"Wild Moves" Wettkampfgruppe', '2026-01-08T17:00', '2026-12-24T19:30'),
    ev('psychosoziale Beratung', '2026-07-15', '2026-11-30'),
    ev('Rote Falken Gruppenstunde', '2026-11-13T18:00')]) assert.ok(isRoutine(e), e.title);
  for (const e of [theatre, ev('Malkurs für Kinder: Mach die Welt bunter!', '2026-11-14T09:30'), ev('Studio Visits - Exkursion', '2026-11-06T14:00')]) assert.ok(!isRoutine(e), e.title);
});

test('municipal notices are excluded, real events with similar words are not', () => {
  for (const t of ['Grünschnittcontainer', 'Generalversammlung mit Neuwahl', 'Sparverein OST - Auszahlung - 19:00 Uhr']) assert.ok(isAdminNotice({ title: t }), t);
  for (const t of ['Prunksitzung der Faschingsgilde', 'Weihnachtsmarkt', 'Danish String Quartet']) assert.ok(!isAdminNotice({ title: t }), t);
});

test('family strand means children: a programme from 14 is not a family pick', () => {
  assert.equal(isFamilyPick(ev('Individueller Sicherungsworkshop', '2026-11-14', null, { age_min: 14 })), false);
  assert.equal(isFamilyPick(ev('Puppentheater', '2026-11-14', null, { age_min: 4 })), true);
});

test('long markets and seasonal events are occasions; months-long listings are not', () => {
  assert.ok(isOccasion({ title: 'Weihnachtsmarkt am Spittelberg', starts_at: '2026-11-13', ends_at: '2026-12-23', categories: ['market'] }));
  assert.ok(isOccasion({ title: 'Galerie Dumas im Advent', starts_at: '2026-11-14T14:00' }));
  assert.ok(!isOccasion({ title: '90 Jahre Tabakfabrik Ausstellung', starts_at: '2026-09-01', ends_at: '2026-12-30' }));
});

test('a one-off kids theatre outranks a curated-source course series', () => {
  assert.ok(cmp(theatre, course) > 0);
});

test('an in-season Christmas market outranks an ordinary one-off of the same tier', () => {
  const market = { title: 'Christkindlmarkt Leonding', starts_at: '2026-11-27', ends_at: '2026-12-23', categories: ['market'], src_kind: 'crawl' };
  const talk = { title: 'Vortrag', starts_at: '2026-11-28T19:00', categories: [], src_kind: 'crawl' };
  assert.ok(cmp(market, talk) > 0);
});

test('titleKey folds venue variants and numbered series of one show', () => {
  assert.equal(titleKey('Könige - Junges Theater Liesing'), titleKey('Könige - Junges Theater Favoriten'));
  assert.equal(titleKey('KT Klettertreff Kinder 8-10 Jahre Termin 1'), titleKey('KT Klettertreff Kinder 8-10 Jahre Termin 2'));
  assert.notEqual(titleKey('Lesung: Anna'), titleKey('Lesung: Berta'));
});

test('takeDiverse caps a venue and a season per issue, then tops up when short', () => {
  const hall = (i) => ({ id: `h${i}`, title: `Show ${i}`, venue: 'Halle', town: 'Linz' });
  assert.deepEqual(takeDiverse([hall(1), hall(2), hall(3), { id: 'x', title: 'Other' }], 3).map((e) => e.id), ['h1', 'h2', 'x']);
  assert.equal(takeDiverse([hall(1), hall(2), hall(3)], 3).length, 3, 'top-up keeps the strand full');
  const markets = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, title: `Weihnachtsmarkt ${'ABCDE'[i]}`, starts_at: '2026-12-05' }));
  const got = takeDiverse([...markets, { id: 'c', title: 'Konzert', starts_at: '2026-12-05' }], 4).map((e) => e.id);
  assert.deepEqual(got, ['m0', 'm1', 'm2', 'c']);
});

test('splitSections no longer fills the family strand with one hall', () => {
  const pool = [1, 2, 3, 4, 5].map((i) => ({ id: `k${i}`, title: `Kurs ${i}`, categories: ['family'], venue: 'AM TURM', town: 'Linz' }))
    .concat([{ id: 'p', title: 'Puppentheater', categories: ['family'], venue: 'Kuddelmuddel' }]);
  const { picks } = splitSections(pool, 3);
  assert.deepEqual(picks.map((e) => e.id), ['k1', 'k2', 'p']);
});

test('pickFlags blocks what a reviewer must swap', () => {
  assert.deepEqual(pickFlags(course, { section: 'family' }).block, ['routine_course_or_service']);
  assert.deepEqual(pickFlags(ev('Sicherungsworkshop', '2026-11-14T10:00', null, { age_min: 14 }), { section: 'family' }).block, ['not_for_children']);
  assert.deepEqual(pickFlags(theatre, { section: 'family' }).block, []);
});
