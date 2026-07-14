// Register the verified family/verein/nature sources from the 2026-07-14
// source sweep (docs/design/big-city-quality.md §3.1; agent-verified live:
// robots-allowed, server-rendered, real future-dated events). All flow through
// the existing waterfall — OÖ Familienbund via JSON-LD, the rest via the LLM
// route (low volume each, so token cost is negligible). Idempotent
// (upsertSource ON CONFLICT url). Naturfreunde + Kinderfreunde are NOT here —
// they have dedicated cms adapters and were registered with them.
// Usage: node --env-file=.env.local scripts/register-family-sources.mjs
import { upsertSource, closeDb } from '../lib/db.js';

const SOURCES = [
  { name: 'FRida & freD Kindermuseum — Alle Termine', url: 'https://fridaundfred.at/alle-termine/', kind: 'museum', town: 'Graz', region: 'Steiermark' },
  { name: 'Stadtbibliothek Graz — Veranstaltungen', url: 'https://stadtbibliothek.graz.at/Veranstaltungen', kind: 'library', town: 'Graz', region: 'Steiermark' },
  { name: 'Stadtbibliothek Innsbruck — Veranstaltungskalender', url: 'https://stadtbibliothek.innsbruck.gv.at/de/programm/veranstaltungskalender/5-0.html', kind: 'library', town: 'Innsbruck', region: 'Tirol', notes: 'Only page-1 events are server-rendered (AJAX filter behind JsonFormular) — low volume by design.' },
  { name: 'Wissensturm Linz — Stadtbibliothek Veranstaltungen', url: 'https://wissensturm.linz.at/bibliothek/veranstaltungen.php', kind: 'library', town: 'Linz', region: 'Oberösterreich' },
  { name: 'VHS Linz Kursportal — Vorträge & Veranstaltungen', url: 'https://vhskurs.linz.at/index.php?kathaupt=109', kind: 'library', town: 'Linz', region: 'Oberösterreich', notes: 'robots Crawl-delay:30 (politeFetch honors); monthly-paginated, page 1 only; ics.php + /schnittstelle/ are robots-blocked — HTML only.' },
  { name: 'Naturpark Attersee-Traunsee — Termine', url: 'https://www.naturpark-attersee-traunsee.at/veranstaltungen-termine/', kind: 'nature', region: 'Oberösterreich', notes: 'Multi-town Naturpark program; towns from event text.' },
  { name: 'ASVÖ Familiensporttage', url: 'https://www.asvoe.at/familiensporttage', kind: 'verein', notes: 'Nationwide annual list (~20 town+date family sport days); towns from event text.' },
  { name: 'OÖ Familienbund — Veranstaltungen', url: 'https://ooe.familienbund.at/veranstaltungen/', kind: 'verein', region: 'Oberösterreich', notes: 'The Events Calendar (WP): full schema.org/Event JSON-LD per event — jsonld route wins, $0.' },
  { name: 'Nationalpark Donau-Auen — Alle Angebote', url: 'https://www.donauauen.at/besuchen/erleben/alle-angebote', kind: 'nature', region: 'Niederösterreich', notes: 'Livewire SSR — page 1 (~25 events) server-rendered; pages 2/3 are client-side, not fetched.' },
  { name: 'Alpenverein Graz — Jugend & Familie', url: 'https://www.alpenverein.at/graz/termine/uebersicht-jugend-und-familien.php', kind: 'verein', town: 'Graz', region: 'Steiermark' },
  { name: 'Alpenverein Linz — Jugend', url: 'https://www.alpenverein.at/linz/jugend/index.php', kind: 'verein', town: 'Linz', region: 'Oberösterreich' },
  { name: 'Alpenverein Innsbruck — Aktivitätenprogramm', url: 'https://www.alpenverein.at/jugend-innsbruck/spalte3/aktivitaetenprogramm-aktuelles-programm.php', kind: 'verein', town: 'Innsbruck', region: 'Tirol' },
  { name: 'Alpenverein Salzburg — Kurse & Touren', url: 'https://www.alpenverein.at/salzburg/kurse-und-touren/index.php', kind: 'verein', town: 'Salzburg', region: 'Salzburg', notes: 'Gesamtprogramm incl. adult tours — LLM extracts all, family filter is the UI lens.' },
];

for (const s of SOURCES) {
  await upsertSource({ ...s, country: 'AT', works: true });
  console.log(`registered: ${s.name}`);
}
console.log(`${SOURCES.length} sources upserted`);
await closeDb();
