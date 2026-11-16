// 2026-11-16: Linz venue sources on deterministic adapters (facts + linkback only).
//  - Landestheater Linz /termine        cms=landestheater-linz (lib/landestheater-linz-events.js)
//  - Zoo Linz Veranstaltungen            cms=zoo-linz           (lib/zoo-linz-events.js)
//  - OÖ Landesbibliothek (existing row)  cms=landesbibliothek   (lib/landesbibliothek-events.js)
//  - Alpenverein Linz Jugend (existing)  cms=alpenverein-linz   (lib/alpenverein-linz-events.js)
//  - Ars Electronica Center calendar     generic JSON-LD route (no cms)
// Authorization (CLAUDE.md rule 9): robots.txt allows these paths for our UA (re-checked below on every
// run); the sites' terms contain nothing against facts-only indexing with linkback.
// Idempotent (ON CONFLICT url). Dry run by default.
// Usage: node --env-file=.env.local scripts/register-linz-venues.mjs [--write]
import postgres from 'postgres';
import { robotsAllowed } from '../lib/crawl-net.js';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, connection: { search_path: 'umkreis' } });
const write = process.argv.includes('--write');
const base = { town: 'Linz', region: 'Oberösterreich', country: 'AT' };

const SOURCES = [
  {
    ...base, name: 'Landestheater Linz — Termine', url: 'https://www.landestheater-linz.at/termine', kind: 'venue',
    cms: 'landestheater-linz', feed_kind: null, default_venue: 'Landestheater Linz', default_address: 'Promenade 39, 4020 Linz',
    notes: 'Deterministic: server-rendered /termine (day headings, HH:MM slots, stage, Sparte); closed performances skipped. '
      + 'The list is capped at ~100 performances per request, so the adapter pages by POSTing cal=D.M.YYYY to the site\'s own '
      + '/DE/repos/evoscripts/lth/getEvents list endpoint (robots only disallow /Shop/, /Admin/, /Payment/) for ~8 weeks. '
      + 'No per-event detail URL exists (JS widget); source_url is /termine#event-<id>. Facts only.',
  },
  {
    ...base, name: 'Zoo Linz — Veranstaltungen', url: 'https://www.zoo-linz.at/de/erlebnis-zoo/veranstaltungen', kind: 'nature',
    cms: 'zoo-linz', feed_kind: null, default_venue: 'Zoo Linz', default_address: 'Römerstraße 100, 4020 Linz',
    notes: 'Deterministic: Drupal accordion headers "Fr., 20.11.2026 14:00–15:30 - Title". No per-event URL; source_url is the listing. '
      + 'Adult-only courses (für Erwachsene / Sachkundenachweis) get workshop instead of family. Facts only.',
  },
  {
    ...base, name: 'OÖ Landesbibliothek – Veranstaltungen', url: 'https://www.landesbibliothek.at/veranstaltungen', kind: 'library',
    cms: 'landesbibliothek', feed_kind: null, default_venue: 'OÖ Landesbibliothek', default_address: 'Schillerstraße 50, 4020 Linz',
    notes: 'Deterministic: TYPO3 news-list rows (.news-list-item: dd.mm.yy + weekday/time + headline + /veranstaltungen/detail/<slug>), '
      + 'follows /veranstaltungen/seite-N (max 5). The coloured label can be a status ("Ausgebucht"), never used as a category. Facts only.',
  },
  {
    ...base, name: 'Alpenverein Linz — Jugend', url: 'https://www.alpenverein.at/linz/jugend/index.php', kind: 'verein',
    cms: 'alpenverein-linz', feed_kind: null, default_venue: null, default_address: null,
    notes: 'Deterministic: Weblication list entries (dd.mm.yyyy [hh:mm] [- dd.mm.yyyy [hh:mm]]) linking to '
      + 'office-details-Online.php?veranstaltungID=<uuid> (source_url, stable identity). Many entries are courses/series; start/end are '
      + 'emitted as given and the pick policy demotes long spans. Same entry can be listed twice on the page (deduped by id). Facts only.',
  },
  {
    ...base, name: 'Ars Electronica Center — Kalender', url: 'https://ars.electronica.art/center/de/calendar/', kind: 'museum',
    cms: null, feed_kind: null, default_venue: 'Ars Electronica Center', default_address: 'Ars-Electronica-Straße 1, 4040 Linz',
    notes: 'Generic JSON-LD/structured waterfall (no cms adapter). Recurring slots may repeat many times a day; see crawl output.',
  },
];

for (const s of SOURCES) console.log(`${s.url} robots: ${await robotsAllowed(s.url)}`);
if (!write) { console.log('Dry run — re-run with --write.'); await sql.end(); process.exit(0); }

for (const s of SOURCES) {
  if (!await robotsAllowed(s.url)) throw new Error(`robots disallow ${s.url}`);
  await sql`
    INSERT INTO sources (name, url, kind, town, region, country, cms, feed_kind, default_venue, default_address, works, notes)
    VALUES (${s.name}, ${s.url}, ${s.kind}, ${s.town}, ${s.region}, ${s.country}, ${s.cms}, ${s.feed_kind},
            ${s.default_venue}, ${s.default_address}, true, ${s.notes})
    ON CONFLICT (url) DO UPDATE SET cms = EXCLUDED.cms, works = true, notes = EXCLUDED.notes,
      default_venue = COALESCE(EXCLUDED.default_venue, sources.default_venue),
      default_address = COALESCE(EXCLUDED.default_address, sources.default_address),
      region = EXCLUDED.region, country = EXCLUDED.country`;
  console.log(`registered ${s.name}`);
}
await sql.end();
