// One-off (2026-11-12): Steyr-area source repair after the coverage check.
//  - Museum Arbeitswelt Steyr: official The-Events-Calendar iCal feed (direct
//    text/calendar → deterministic iCal route). robots.txt allows all; the
//    Impressum's copyright clause covers texts/images, and we store facts +
//    linkback only.
//  - Dietach: GEM2GO calendar moved; old path 404s, so the source went dead.
//  - Garsten: moved off GEM2GO to a new site with no public events page.
//    Stays non-scheduled; noted so it doesn't look covered.
//
// Usage: node --env-file=.env.local scripts/register-steyr-sources.mjs [--write]
import postgres from 'postgres';
import { robotsAllowed } from '../lib/crawl-net.js';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, connection: { search_path: 'umkreis' } });
const write = process.argv.includes('--write');

const MUSEUM = {
  name: 'Museum Arbeitswelt Steyr — iCal',
  url: 'https://museumarbeitswelt.at/veranstaltungen/?ical=1',
  kind: 'museum', town: 'Steyr', region: 'Oberösterreich', country: 'AT', feed_kind: 'ical',
  default_venue: 'Museum Arbeitswelt', default_address: 'Wehrgrabengasse 7, 4400 Steyr',
  notes: 'Official museum calendar (WP The Events Calendar). Direct iCal endpoint; deterministic. '
    + 'Legal check 2026-11-12: robots allow all; copyright notice covers prose/images only — facts + linkback.',
};
const DIETACH = {
  old: 'https://www.dietach.at/UNSER_DIETACH/Veranstaltungen',
  url: 'https://www.dietach.at/UnserDietach/Kultur_Freizeit/Veranstaltungen',
};
const GARSTEN_URL = 'https://www.garsten.at/Buergerservice/Aktuelles/Veranstaltungen';

console.log(`museum robots: ${await robotsAllowed(MUSEUM.url)}; dietach robots: ${await robotsAllowed(DIETACH.url)}`);
if (!write) { console.log('Dry run — re-run with --write.'); await sql.end(); process.exit(0); }

await sql`
  INSERT INTO sources (name, url, kind, town, region, country, feed_kind, default_venue, default_address, works, notes)
  VALUES (${MUSEUM.name}, ${MUSEUM.url}, ${MUSEUM.kind}, ${MUSEUM.town}, ${MUSEUM.region},
          ${MUSEUM.country}, ${MUSEUM.feed_kind}, ${MUSEUM.default_venue}, ${MUSEUM.default_address}, true, ${MUSEUM.notes})
  ON CONFLICT (url) DO UPDATE SET works = true, notes = EXCLUDED.notes,
    default_venue = EXCLUDED.default_venue, default_address = EXCLUDED.default_address`;

const [taken] = await sql`SELECT id FROM sources WHERE url = ${DIETACH.url}`;
if (!taken) {
  await sql`
    UPDATE sources SET url = ${DIETACH.url}, tier = 'active', zero_streak = 0, page_hash = NULL,
      notes = concat_ws(' | ', notes, 'URL moved 2026-11-12 (old path 404); repointed to new GEM2GO calendar.')
    WHERE url = ${DIETACH.old}`;
}

await sql`
  UPDATE sources SET works = false,
    notes = concat_ws(' | ', notes, '2026-11-12: garsten.at relaunched off GEM2GO; no public events page found. Not crawlable until one exists — flagged to George.')
  WHERE url = ${GARSTEN_URL} AND works`;

console.log('Done.');
await sql.end();
