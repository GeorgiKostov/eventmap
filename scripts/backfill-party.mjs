// Route B backfill: tag existing events with the 'party' category (Route C added
// the category + taught the extractor going forward, but already-crawled rows
// predate it). Derives party from the title+description text with a curated
// nightlife term-list and explicit exclusions so sports ("Fußball", "Handball")
// and lookalikes ("Technologie", "Discount") never false-match — whole-token
// matching, same tripwire style as lib/moderation.js.
//
// DRY-RUN by default: prints counts + a sample so the match set can be eyeballed.
// Apply for real with:  node --env-file=.env.local scripts/backfill-party.mjs --apply
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

// Nightlife / dance terms. Multi-word entries use \s+; every term is matched as
// a whole token (letters/digits on neither side), so 'techno' won't hit
// 'Technologie', 'disco' won't hit 'Discount', 'dj' won't hit 'Django'.
const PARTY_TERMS = [
  'party', 'partynacht', 'afterparty', 'after\\s*work\\s*party', 'clubbing',
  'clubnacht', 'clubnight', 'club\\s+night', 'rave', 'techno', 'house\\s*party',
  'dj\\s*-?\\s*set', 'disco', 'diskothek', 'discoteca',
  'tanznacht', 'tanzparty', 'schlagerparty', 'ü30', 'ü40', 'ü50', 'ladies\\s+night',
  'silvesterparty', 'faschingsparty', 'clubevent', 'fete', 'fête',
  // Austrian dance "Ball" compounds only — NOT bare "ball" (that catches Fußball).
  'maturaball', 'feuerwehrball', 'faschingsball', 'silvesterball', 'maskenball',
  'trachtenball', 'opernball', 'neujahrsball', 'zunftball', 'bauernball', 'jägerball',
  'blaulichtball', 'abschlussball',
  // Bulgarian
  'парти', 'купон', 'диско',
];

// Sports/other compounds that must never be read as a party even if a fragment
// looks party-ish (belt-and-braces; the term-list above already avoids bare "ball").
const EXCLUDE_TERMS = [
  'fußball', 'fussball', 'handball', 'volleyball', 'basketball', 'baseball',
  'football', 'softball', 'ballsport', 'ballschule', 'ballspiel', 'ballkorb',
  'discounter', 'discount', 'technologie', 'technologien', 'technisch',
];

const tokenRe = (terms) =>
  new RegExp(terms.map((t) => `(?<![\\p{L}\\p{N}])${t}(?![\\p{L}\\p{N}])`).join('|'), 'iu');

const PARTY_RE = tokenRe(PARTY_TERMS);
const EXCLUDE_RE = tokenRe(EXCLUDE_TERMS);

const isParty = (hay) => PARTY_RE.test(hay) && !EXCLUDE_RE.test(hay);

const rows = await sql`
  SELECT id, title, description, categories, town
  FROM events
  WHERE status = 'published' AND kind = 'event' AND NOT ('party' = ANY(categories))
`;

// Match on TITLE only — the reliable signal. Descriptions are our own AI-written
// summaries and matching them adds noise (e.g. a sports event whose summary
// mentions an after-party). A party is a party if it says so on the tin.
const matched = rows.filter((r) => isParty(r.title || ''));

console.log(`scanned ${rows.length} non-party events; ${matched.length} match the party heuristic.`);
console.log('--- sample (up to 25) ---');
for (const r of matched.slice(0, 25)) {
  console.log(`  · ${(r.title || '').slice(0, 64)}  [${(r.categories || []).join(',') || '—'}]  ${r.town || ''}`);
}

if (!APPLY) {
  console.log('\nDRY-RUN. Re-run with --apply to add "party" to these rows.');
  await sql.end();
} else {
  const ids = matched.map((r) => r.id);
  let updated = 0;
  if (ids.length) {
    const res = await sql`
      UPDATE events SET categories = array_append(categories, 'party'), updated_at = now()
      WHERE id = ANY(${ids}) AND NOT ('party' = ANY(categories))
    `;
    updated = res.count;
  }
  console.log(`\nAPPLIED: added "party" to ${updated} events.`);
  await sql.end();
}
