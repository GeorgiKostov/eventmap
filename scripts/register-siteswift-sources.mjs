// Register the confirmed "siteswift" diocese calendar sources (2026-07-14
// sweep, CLAUDE.md task: Austrian diocese termine pages). All six dioceses on
// this platform share the robots fingerprint `Disallow: /*.siteswift$` +
// `Crawl-delay: 10` + `Request-rate: 1/30`; only the five below had a live,
// server-rendered listing page confirmed — Feldkirch's /portal/kalender is
// live but its event list loads via a `.siteswift` AJAX call (JS-only, and
// that path is robots-disallowed anyway), so it is deliberately NOT
// registered here. Idempotent (upsertSource ON CONFLICT url).
// Usage: node --env-file=.env.local scripts/register-siteswift-sources.mjs
import { upsertSource, closeDb } from '../lib/db.js';

const NOTES = 'siteswift CMS: robots Disallow /*.siteswift$, Crawl-delay 10, '
  + 'Request-rate 1/30 (lib/crawl-net.js parses both, effective host delay = max). '
  + 'Listing is a fixed ~20-event "next upcoming" window, not a full month — date '
  + 'navigation only exists via disallowed .siteswift URLs, so no pagination; crawl '
  + 'recadence rolls the window forward over repeated crawls. Verified live 2026-07-14.';

const SOURCES = [
  { name: 'Diözese Linz — Termine', url: 'https://www.dioezese-linz.at/termine', region: 'Oberösterreich' },
  { name: 'Erzdiözese Wien — Termine', url: 'https://www.erzdioezese-wien.at/termine', region: 'Wien' },
  { name: 'Diözese Graz-Seckau — Termine', url: 'https://www.katholische-kirche-steiermark.at/portal/termine', region: 'Steiermark' },
  { name: 'Diözese Eisenstadt — Termine', url: 'https://www.martinus.at/portal/termine', region: 'Burgenland' },
  { name: 'Erzdiözese Salzburg — Veranstaltungen', url: 'https://www.edsbg.at/veranstaltungen', region: 'Salzburg', notes: `${NOTES} (Termine path redirects to /home on this diocese — /veranstaltungen is the equivalent live listing.)` },
];

for (const s of SOURCES) {
  await upsertSource({
    ...s, kind: 'church', cms: 'siteswift', country: 'AT', works: true,
    notes: s.notes || NOTES,
  });
  console.log(`registered: ${s.name}`);
}
console.log(`${SOURCES.length} sources upserted`);
await closeDb();
