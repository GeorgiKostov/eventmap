// Idempotent: sources.default_categories — categories every event from a source
// inherits, regardless of what the extractor guessed from the page text.
//
// Why this exists: the extractor reads an event's own words. A FRida & freD
// (children's museum) listing that says "Stille Stunden — Inklusives Programm"
// reads as 'culture' — nothing in that sentence says "kids". So 144 events from
// a CHILDREN'S MUSEUM landed without the `family` tag and were invisible under
// the "For kids" filter, which is the entire reason we crawled it. The fact that
// makes them family events lives in the SOURCE, not the text: everything FRida
// publishes is for children. Same for Kinderfreunde, Familienbund, ASVÖ
// Familiensporttage, and the Alpenverein Jugend-&-Familie section pages.
//
// Deliberately NOT applied to mixed-audience sources (dioceses, libraries,
// Naturparks, Alpenverein's general Gesamtprogramm): forcing `family` there
// would be exactly the kind of fabrication hard rule 5 forbids, just in the
// category column instead of the date column.
//
// Usage: node --env-file=.env.local scripts/migrate-source-categories.mjs [--write]
import postgres from 'postgres';

const WRITE = process.argv.includes('--write');
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

await sql`alter table sources add column if not exists default_categories text[] not null default '{}'`;

// url → categories every event from that source carries.
const DEFAULTS = [
  ['https://fridaundfred.at/en/termine/', ['family']],                                    // children's museum
  ['https://kinderfreunde.at/ehrenamt/veranstaltungen', ['family']],
  ['https://www.naturfreunde.at/events/ng_items', ['family']],                            // crawled with the family/kids target-group filter
  ['https://ooe.familienbund.at/veranstaltungen/', ['family']],
  ['https://www.asvoe.at/familiensporttage', ['family', 'sport']],
  ['https://www.alpenverein.at/graz/termine/uebersicht-jugend-und-familien.php', ['family']],
  ['https://www.alpenverein.at/linz/jugend/index.php', ['family']],
  ['https://www.alpenverein.at/jugend-innsbruck/spalte3/aktivitaetenprogramm-aktuelles-programm.php', ['family']],
];

for (const [url, cats] of DEFAULTS) {
  const res = await sql`update sources set default_categories=${cats} where url=${url}`;
  console.log(`${res.count ? '✓' : '✗ (not registered)'} ${cats.join('+').padEnd(13)} ${url}`);
}

// Backfill: existing events from those sources are missing the tag the source
// implies. Append (never replace) — an event already tagged 'workshop' keeps it.
//
// Joined on source_NAME, not source_url: every adapter that emits per-event
// permalinks (JSON-LD, siteswift, Naturfreunde, Kinderfreunde) stores the
// EVENT's URL in source_url, never the listing URL, so a url-join silently
// matches only the minority of sources whose events happen to carry the listing
// link — it found FRida's 144 and missed OÖ Familienbund entirely. `source_name`
// is set from src.name on every write path, so it's the reliable key.
const [{ n }] = await sql`
  select count(*)::int as n from events e join sources s on s.name = e.source_name
  where s.default_categories <> '{}' and e.status='published'
    and not (s.default_categories <@ e.categories)`;
console.log(`\n${n} published events missing their source's default categories`);

if (WRITE) {
  const res = await sql`
    update events e set categories = (
      select array(select distinct unnest(e.categories || s.default_categories))
    ), updated_at = now()
    from sources s
    where s.name = e.source_name and s.default_categories <> '{}'
      and e.status='published' and not (s.default_categories <@ e.categories)`;
  console.log(`backfilled ${res.count} events`);
} else {
  console.log('(dry-run — pass --write to backfill)');
}

await sql.end();
