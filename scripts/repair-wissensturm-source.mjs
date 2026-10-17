// The library moved its public dated cards; the former calendar now returns 404.
import { getSourceByUrl, upsertSource, closeDb } from '../lib/db.js';
import { robotsAllowed } from '../lib/crawl-net.js';
import { WISSENSTURM_SOURCE_URL } from '../lib/wissensturm-events.js';

const oldUrl = 'https://wissensturm.linz.at/bibliothek/veranstaltungen.php';
const note = '2026-10-17: Public library calendar moved to /bibliothek/index.php; '
  + 'same approved publisher, visible dated cards parsed by wissensturm adapter. '
  + 'Do not follow the VHS calendar redirect to a robots-disallowed course URL.';

async function main() {
  const write = process.argv.includes('--write');
  const [previous] = await getSourceByUrl(oldUrl);
  const [current] = await getSourceByUrl(WISSENSTURM_SOURCE_URL);
  if (!previous && !current) throw new Error('Existing approved Wissensturm source not found');
  if (!await robotsAllowed(WISSENSTURM_SOURCE_URL)) throw new Error('Replacement source disallowed by robots');
  const source = current || previous;
  const notes = source.notes?.includes(note) ? source.notes : [source.notes, note].filter(Boolean).join('\n');
  console.log(`${write ? 'Repair' : 'Would repair'} Wissensturm: ${WISSENSTURM_SOURCE_URL}`);
  if (write) {
    await upsertSource({ ...source, url: WISSENSTURM_SOURCE_URL, cms: 'wissensturm', works: true, notes });
    if (previous) await upsertSource({ ...previous, works: false,
      notes: previous.notes?.includes(note) ? previous.notes : [previous.notes, note].filter(Boolean).join('\n') });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(closeDb);
