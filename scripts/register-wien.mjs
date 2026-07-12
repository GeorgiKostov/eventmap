// One-off: register the Vienna aggregator layer (task: "Vienna DEEP,
// families-first"). Vienna has no Gemeinde-style municipal calendar (0
// sources registered pre-existing) — its events live in city-level
// aggregators instead. Every URL below was verified live + robots-allowed
// by hand before this list was written (see session notes / final report).
// Usage: node --env-file=.env.local scripts/register-wien.mjs
import { upsertSource, closeDb } from '../lib/db.js';

const SOURCES = [
  {
    name: 'Wien erleben (Stadt Wien) — alle Veranstaltungen',
    url: 'https://www.wien.gv.at/veranstaltungen/',
    kind: 'city_calendar', cms: 'wien-erleben',
    notes: 'Official Vienna city events calendar (replaced the dead data.gv.at '
      + '"Veranstaltungen Wien" open-data set, Dec 2025). Two-hop JSON-LD: listing '
      + 'page teasers link to per-event detail pages carrying schema.org/Event '
      + '(non-standard dialect — subEvent[] for recurrence, addresses[]/geos[] — '
      + 'handled by parseWienErlebenEvents in crawl.mjs, gated on cms=wien-erleben).',
  },
  {
    name: 'Wien erleben — für Kinder',
    url: 'https://www.wien.gv.at/veranstaltungen/kinder',
    kind: 'city_calendar', cms: 'wien-erleben',
    notes: 'Same site/parser as the main Wien erleben listing, pre-filtered to the '
      + '"für Kinder" (for children) category — families-first coverage.',
  },
  {
    name: 'Wien erleben — Sommer',
    url: 'https://www.wien.gv.at/veranstaltungen/sommer',
    kind: 'city_calendar', cms: 'wien-erleben',
    notes: 'Same site/parser, seasonal "Sommer in Wien" curated picks — different '
      + 'selection than the homepage/kinder feed, still two-hop JSON-LD.',
  },
  {
    name: 'WIENXTRA — Veranstaltungen',
    url: 'https://wienxtra.at/veranstaltungen/',
    kind: 'regional_feed', cms: null,
    notes: 'THE Vienna family-events publisher (city-adjacent youth org, runs '
      + 'Kinderaktiv/Ferienspiel). 381 events at probe time, server-rendered, no '
      + 'JSON-LD/iCal/RSS — resolves via LLM fallback. robots.txt: allow all.',
  },
  {
    name: 'MuseumsQuartier Wien — Programm/Events',
    url: 'https://www.mqw.at/programm',
    kind: 'regional_feed', cms: null,
    notes: 'Multi-venue aggregator (mumok, ZOOM Kindermuseum, Dschungel Wien, '
      + 'Kunsthalle, etc.) — has a "Kinder & Familie" category filter. '
      + 'Server-rendered listing text, no JSON-LD Event — LLM fallback. '
      + 'Picks up ZOOM/Dschungel programming that their own sites don\'t expose '
      + '(both are JS-only SPAs, unfetchable directly). robots.txt: allow all.',
  },
];

async function main() {
  for (const s of SOURCES) {
    await upsertSource({ ...s, town: 'Wien', region: 'Wien', country: 'AT', works: true });
    console.log(`registered: ${s.name} (${s.url})`);
  }
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
