// Gap-fill registration pass over data/catalog/probed-all-1823.json: picks up
// the residue register-probed.mjs skipped (low-confidence, and medium/high
// rows whose cms came back 'unknown'/'other') for rows that DID find a real
// events page — these route through the LLM/JSON-LD/iCal waterfall instead
// of the deterministic GEM2GO parser, but they're still genuine sources.
// Targets the Bundesländer with the biggest catalog-vs-registered gaps.
//
// Quality guard (false-positive traps from tasks/lessons.md + mining-brief):
// drops admin/legal pages (Veranstaltungsgesetz, Förderrichtlinie, Müll-
// /Abfalltermine, Genehmigung, Vermietung/Reservierung formulas), PDF/DOC
// calendar files (not fetchable through the HTML waterfall), bare-homepage
// matches, single dated blog posts (month-name or jubiläum slugs — a
// specific news article mistaken for a persistent calendar), and
// "Veranstaltungszentrum/-saal/-raum/-halle" venue-facility pages (a hall's
// own description page, not a list of events happening in it).
//
// Usage: node --env-file=.env.local scripts/register-gapfill.mjs             (dry run)
//        node --env-file=.env.local scripts/register-gapfill.mjs --write
import fs from 'fs';
import path from 'path';
import { listSourcesForDedup, upsertSource, closeDb } from '../lib/db.js';

const TARGET_REGIONS = ['Steiermark', 'Burgenland', 'Kärnten', 'Oberösterreich', 'Niederösterreich', 'Tirol', 'Vorarlberg'];

function parseArgs(argv) {
  const args = { write: false, file: 'data/catalog/probed-all-1823.json' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') args.write = true;
    else if (argv[i] === '--file') args.file = argv[++i];
  }
  return args;
}

// Same acceptance policy as register-probed.mjs — rows that already passed
// it are registered already (or will be by that script); we only want the
// residue it explicitly skips.
function passesOriginalPolicy(r) {
  if (r.confidence === 'high') return true;
  if (r.confidence === 'medium' && (r.cms === 'gem2go' || r.cms === 'ris')) return true;
  if (r.country === 'BG' && r.confidence === 'medium') return true;
  return false;
}

const BAD_KEYWORDS = /gesetz|verordnung|satzung|richtlinie|formular|f(o|ö)rder|sitzung|amtlich|m(u|ü)ll|abfall|bauverhandlung|eintragen|impressum|datenschutz|antrag|gebuehr|gebühr|genehmigung|vermietung|buchung|reservierung/i;
const PDF_EXT = /\.(pdf|docx?|xlsx?)(\?|$)/i;
const VENUE_TRAP = /veranstaltungszentr|veranstaltungssaal|veranstaltungsraum|veranstaltungshalle|veranstaltungslokal|kalender_turnhalle|kalender.turnhalle/i;
const MONTH_OR_JUBILEE_SLUG = /januar|februar|-maerz-|-marz-|-april-|-mai-|-juni-|-juli-|-august-|september|oktober|november|dezember|jahre-|jubil|jahreshaelfte|jahreshälfte|halbjahr/i;

function falsePositiveReason(r) {
  if (BAD_KEYWORDS.test(r.url)) return 'admin/legal';
  if (PDF_EXT.test(r.url)) return 'pdf/doc';
  if (r.url === r.homepage) return 'bare homepage';
  if (VENUE_TRAP.test(r.url)) return 'venue/facility page';
  if (MONTH_OR_JUBILEE_SLUG.test(r.url)) return 'single dated post';
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.join(process.cwd(), args.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const proposed = data.proposed || [];
  console.log(`Loaded ${proposed.length} probed rows from ${args.file}`);

  const gapResidue = proposed.filter((r) => r.url && !passesOriginalPolicy(r) && TARGET_REGIONS.includes(r.region));
  console.log(`Residue (has url, skipped by register-probed.mjs policy, target region): ${gapResidue.length}`);

  const dropped = [];
  const qualityPassed = [];
  for (const r of gapResidue) {
    const reason = falsePositiveReason(r);
    if (reason) dropped.push({ ...r, reason });
    else qualityPassed.push(r);
  }
  console.log(`Quality guard: dropped ${dropped.length} (${(100 * dropped.length / gapResidue.length).toFixed(1)}%), kept ${qualityPassed.length}`);
  const dropByReason = {};
  for (const d of dropped) dropByReason[d.reason] = (dropByReason[d.reason] || 0) + 1;
  console.log('Drop reasons:', JSON.stringify(dropByReason));

  // Dedup against live registry (domain or name+region) — belt and braces,
  // registry may have grown since this data was captured.
  const existing = await listSourcesForDedup();
  const existingDomains = new Set();
  const existingNameRegion = new Set();
  for (const s of existing) {
    try { existingDomains.add(new URL(s.url).hostname.replace(/^www\./, '').toLowerCase()); } catch { /* skip */ }
    if (s.name) existingNameRegion.add(`${s.name.trim().toLowerCase()}|${(s.region || '').trim().toLowerCase()}`);
  }

  const toRegister = [];
  let skippedDup = 0;
  for (const r of qualityPassed) {
    let domain = null;
    try { domain = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* skip */ }
    const nameRegionKey = `${(r.name || '').trim().toLowerCase()}|${(r.region || '').trim().toLowerCase()}`;
    if ((domain && existingDomains.has(domain)) || existingNameRegion.has(nameRegionKey)) {
      skippedDup++;
      continue;
    }
    toRegister.push(r);
    if (domain) existingDomains.add(domain);
    existingNameRegion.add(nameRegionKey);
  }
  console.log(`After dedup against ${existing.length} existing sources: ${toRegister.length} to register (${skippedDup} already registered)`);

  const byRegion = {};
  for (const r of toRegister) byRegion[r.region || 'null'] = (byRegion[r.region || 'null'] || 0) + 1;
  console.log('Per region:', JSON.stringify(byRegion, null, 2));

  console.log('\nSample rows (15):');
  for (const r of toRegister.slice(0, 15)) {
    console.log(`  [${r.region}] ${r.name} — ${r.url} (cms=${r.cms}, confidence=${r.confidence})`);
  }

  if (!args.write) {
    console.log('\nDry run — no writes. Re-run with --write to register.');
    await closeDb();
    return;
  }

  console.log(`\nWriting ${toRegister.length} sources…`);
  let written = 0;
  for (const r of toRegister) {
    await upsertSource({
      name: r.name,
      url: r.url,
      kind: 'municipal',
      town: r.town || null,
      works: true,
      cms: r.cms || null,
      region: r.region || null,
      country: r.country || 'AT',
      notes: `registered via register-gapfill.mjs (confidence=${r.confidence}, cms=${r.cms || 'unknown'})`,
    });
    written++;
  }
  console.log(`Wrote ${written} sources.`);
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
