// Register the Nationalpark Kalkalpen sitemap-based source (2026-07-14
// sweep, CLAUDE.md task). url is the sitemap.xml itself — the crawler fetches
// that, then two-hops into each /veranstaltung/<slug> detail page (see
// lib/kalkalpen-events.js, scripts/crawl.mjs's parseKalkalpenSource).
// Idempotent (upsertSource ON CONFLICT url).
// Usage: node --env-file=.env.local scripts/register-kalkalpen-source.mjs
import { upsertSource, closeDb } from '../lib/db.js';

await upsertSource({
  name: 'Nationalpark Kalkalpen — Veranstaltungen (Sitemap)',
  url: 'https://www.kalkalpen.at/sitemap.xml',
  kind: 'nature',
  cms: 'kalkalpen',
  region: 'Oberösterreich',
  country: 'AT',
  works: true,
  notes: 'Two-hop: veranstaltungskalender is JS-only (Contao), so sitemap.xml (this URL) '
    + 'is fetched instead and filtered to /veranstaltung/<slug> locs (~71 live 2026-07-14); '
    + 'each detail page is politeFetch-ed for its "Termin buchen" occurrence list '
    + '(date/time/town per row) or, as fallback, German prose date text. Pages with '
    + '"kein Termin verfügbar" or no parseable date are skipped. Capped at 80 detail '
    + 'pages per crawl. Events are in/around the Nationalpark; town comes from each '
    + 'occurrence\'s own marker (Molln/Windischgarsten/Reichraming/... seen live), never '
    + 'defaulted.',
});
console.log('registered: Nationalpark Kalkalpen — Veranstaltungen (Sitemap)');
await closeDb();
