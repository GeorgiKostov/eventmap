// Register the reviewed September coverage sources. Dry-run unless --write.
// Includes the three venue publishers George approved on 2026-09-05.
import { pathToFileURL } from 'node:url';
import { getSourceByUrl, getVenue, upsertSource, upsertVenue, closeDb } from '../lib/db.js';
import { robotsAllowed } from '../lib/crawl-net.js';
import { normalizeName } from '../lib/geocode.js';
import { WISSENSTURM_SOURCE_URL } from '../lib/wissensturm-events.js';
import { VIENNA_PLAYGROUNDS_URL, VIENNA_PLAYGROUNDS_SOURCE_NAME } from '../lib/vienna-playgrounds.js';
import { FAMILIENVERBAND_SOURCE_URL } from '../lib/familienverband-events.js';
import { NIEDERMAIR_SOURCE_URL, NIEDERMAIR_CHILDREN_URL } from '../lib/niedermair-events.js';
import { TREIBHAUS_SOURCE_URL } from '../lib/treibhaus-events.js';
import { THEATER_DES_KINDES_SOURCE_URL } from '../lib/linz-theatre-events.js';

export const AUSTRIA_COVERAGE_SOURCES = [
  {
    name: 'Theater des Kindes — Spielplan', url: THEATER_DES_KINDES_SOURCE_URL,
    kind: 'venue', town: 'Linz', region: 'Oberösterreich', country: 'AT',
    cms: 'theater-des-kindes', works: true,
    notes: 'George approved facts-only indexing with exact source links on 2026-09-05 after '
      + 'robots/terms review. Visible occurrence dates and ages; no descriptions or images copied. '
      + 'Authorization decision: docs/decisions/2026-09-05-austria-crawl-authorization.md.',
  },
  ...[
    { name: 'Kabarett Niedermair — Spielplan', url: NIEDERMAIR_SOURCE_URL },
    { name: 'Kabarett Niedermair — Kindertheater', url: NIEDERMAIR_CHILDREN_URL },
  ].map((source) => ({
    ...source, kind: 'venue', town: 'Wien', region: 'Wien', country: 'AT',
    cms: 'niedermair', works: true,
    notes: 'George approved facts-only indexing with source links on 2026-09-05 after robots/terms '
      + 'review. Visible monthly rows corroborate JSON-LD; current month plus two linked months. '
      + 'No descriptions/images copied or end times inferred. See September 5 authorization decision.',
  })),
  {
    name: 'Treibhaus Innsbruck — Programm', url: TREIBHAUS_SOURCE_URL,
    kind: 'venue', town: 'Innsbruck', region: 'Tirol', country: 'AT',
    cms: 'treibhaus', works: true,
    notes: 'George approved facts-only indexing with exact source links on 2026-09-05 after '
      + 'robots/terms review. HTML dates; offsite Congress performances excluded. No copied prose, '
      + 'images or invented iCal ends. See September 5 authorization decision.',
  },
  {
    name: 'Vorarlberger Familienverband (Familienbund) — Veranstaltungen für Familien',
    url: FAMILIENVERBAND_SOURCE_URL,
    kind: 'family', town: 'Bregenz', region: 'Vorarlberg', country: 'AT',
    cms: 'familienverband', works: true,
    notes: 'Existing approved publisher, repaired 2026-09-05: empty archive recovered from '
      + 'same-host homepage, Vater sein calendar and linked featured details. EventON local '
      + 'date components preserve visible Vienna times despite incorrect winter offsets. '
      + 'Actual event addresses only; foreign venues and multi-day course envelopes excluded.',
  },
  {
    name: VIENNA_PLAYGROUNDS_SOURCE_NAME,
    url: VIENNA_PLAYGROUNDS_URL,
    kind: 'municipal', town: 'Wien', region: 'Wien', country: 'AT',
    cms: 'vienna-playgrounds', works: true,
    notes: 'Official City of Vienna playground WFS; CC BY 4.0. Authorization: '
      + 'docs/decisions/2026-09-05-austria-crawl-authorization.md. '
      + 'Recurring deterministic place import, supplied coordinates, no invented hours/fees/ages. '
      + 'Sports-only and ambiguous shared names excluded; existing other-source places preserved. '
      + 'Dataset deletions require review; this import does not remove existing places.',
  },
  {
    name: 'Stadtbibliothek Linz — Veranstaltungen',
    url: WISSENSTURM_SOURCE_URL,
    kind: 'municipal', town: 'Linz', region: 'Oberösterreich', country: 'AT',
    cms: 'wissensturm', works: true,
    notes: 'Previously approved municipal calendar, repaired 2026-09-05 with deterministic '
      + 'visible calendar cards. Exact dates, branch venues and official detail links; no copied descriptions.',
  },
];

// Exact room names in the current library calendar. Official building point:
// https://wissensturm.linz.at/bibliothek/wissensturm.php (openFeature/route links).
const WISSENSTURM_VENUES = [
  'Stadtbibliothek Wissensturm, EG',
  'Stadtbibliothek Wissensturm, KlimaEck',
  'Stadtbibliothek Wissensturm und LeWis, 1. OG',
  'Stadtbibliothek Wissensturm, 2. OG Belletristik',
  'Wissensturm, Saal 01.02',
];

async function main() {
  const write = process.argv.includes('--write');
  for (const source of AUSTRIA_COVERAGE_SOURCES) {
    const [existing] = await getSourceByUrl(source.url);
    if (!await robotsAllowed(source.url)) throw new Error(`Robots unavailable or disallowed: ${source.url}`);
    console.log(`${existing ? 'Update' : 'Register'} ${source.cms}: ${source.url}`);
    if (write) {
      await upsertSource({
        ...existing, ...source,
        // Keep the existing registry identity and its historical source notes.
        name: existing?.name || source.name,
        notes: !existing?.notes ? source.notes : existing.notes.includes(source.notes)
          ? existing.notes : `${existing.notes}\n${source.notes}`,
      });
    }
  }
  for (const name of WISSENSTURM_VENUES) {
    const name_norm = normalizeName(name), town_norm = normalizeName('Linz');
    const existing = await getVenue(name_norm, town_norm, 'AT');
    if (existing) continue;
    console.log(`Register venue: ${name}`);
    if (write) await upsertVenue({
      name, name_norm, town: 'Linz', town_norm, country: 'AT',
      lat: 48.290883, lng: 14.288280, geo_precision: 'venue', resolved_via: 'source',
      source_url: 'https://wissensturm.linz.at/bibliothek/wissensturm.php',
    });
  }
  const theatreName = 'Theater des Kindes';
  const theatreNorm = normalizeName(theatreName), theatreTown = normalizeName('Linz');
  if (!await getVenue(theatreNorm, theatreTown, 'AT')) {
    console.log(`Register venue: ${theatreName}`);
    if (write) await upsertVenue({
      name: theatreName, name_norm: theatreNorm, town: 'Linz', town_norm: theatreTown, country: 'AT',
      lat: 48.298793539307916, lng: 14.289576450404233,
      geo_precision: 'venue', resolved_via: 'source', source_url: THEATER_DES_KINDES_SOURCE_URL,
    });
  }
  console.log(write ? 'Source registration complete.' : 'Dry run; pass --write to register.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDb);
}
