// Same approved Stadt Linz publisher and deterministic route as the Christmas searches.
// Usage: node --env-file=.env.local scripts/register-linz-seasonal-sources.mjs
import { upsertSource, closeDb } from '../lib/db.js';
import { robotsAllowed } from '../lib/crawl-net.js';

try {
  for (const term of ['Laternen', 'Nikolaus', 'Eislaufen', 'Krippen']) {
    const url = `https://www.linztermine.at/suche?query=${encodeURIComponent(term)}`;
    if (!await robotsAllowed(url)) throw new Error(`Robots unavailable or disallowed: ${url}`);
    await upsertSource({
      name: `Linz-Termine — ${term}`, url, kind: 'municipal', town: 'Linz',
      country: 'AT', region: 'Oberösterreich', cms: 'linztermine', works: true,
      notes: 'Previously approved Stadt Linz publisher; same source authorization as the 2026-10-16 seasonal searches. '
        + 'Visible dated occurrences checked 2026-10-17, including 2026 year; no date inference from JSON-LD spans. '
        + 'Repeatable linztermine adapter with occurrence pagination; facts only, no copied prose/images. '
        + 'Search results can include other relevant family events. See docs/research/austria-special-events-2026-10-17.md.',
    });
    console.log(`Registered ${url}`);
  }
} finally { await closeDb(); }
