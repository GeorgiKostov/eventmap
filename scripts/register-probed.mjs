// Turns scripts/probe-sources.mjs output into registered `sources` rows.
// Registration policy (Architect-approved, 2026-07-12): confidence='high'
// (any cms) + confidence='medium' with cms in ('gem2go','ris'). Everything
// else (low/none/unknown-medium) is LLM-review residue, skipped for now.
//
// Usage: node --env-file=.env.local scripts/register-probed.mjs
//          [--file data/catalog/probed-all-1823.json]  (dry run: counts + samples)
//        node --env-file=.env.local scripts/register-probed.mjs --write
import fs from 'fs';
import path from 'path';
import { listSourcesForDedup, upsertSource, closeDb } from '../lib/db.js';

function parseArgs(argv) {
  const args = { write: false, file: 'data/catalog/probed-all-1823.json' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') args.write = true;
    else if (argv[i] === '--file') args.file = argv[++i];
  }
  return args;
}

function passesPolicy(r) {
  if (r.confidence === 'high') return true;
  if (r.confidence === 'medium' && (r.cms === 'gem2go' || r.cms === 'ris')) return true;
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.join(process.cwd(), args.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const proposed = data.proposed || [];
  console.log(`Loaded ${proposed.length} probed rows from ${args.file}`);

  const selected = proposed.filter(passesPolicy);
  console.log(`Policy-selected: ${selected.length} (high=${proposed.filter((r) => r.confidence === 'high').length}, `
    + `medium+gem2go/ris=${proposed.filter((r) => r.confidence === 'medium' && (r.cms === 'gem2go' || r.cms === 'ris')).length})`);

  // Dedup against already-registered sources (domain or name+region) — belt
  // and braces even though probe-sources.mjs already excluded these at
  // probe time; the registry may have moved since.
  const existing = await listSourcesForDedup();
  const existingDomains = new Set();
  const existingNameRegion = new Set();
  for (const s of existing) {
    try { existingDomains.add(new URL(s.url).hostname.replace(/^www\./, '').toLowerCase()); } catch { /* skip */ }
    if (s.name) existingNameRegion.add(`${s.name.trim().toLowerCase()}|${(s.region || '').trim().toLowerCase()}`);
  }

  const toRegister = [];
  let skippedDup = 0;
  for (const r of selected) {
    let domain = null;
    try { domain = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* skip */ }
    const nameRegionKey = `${(r.name || '').trim().toLowerCase()}|${(r.region || '').trim().toLowerCase()}`;
    if ((domain && existingDomains.has(domain)) || existingNameRegion.has(nameRegionKey)) {
      skippedDup++;
      continue;
    }
    toRegister.push(r);
    // Prevent double-registering two probed rows that share a domain/name
    // within this same run.
    if (domain) existingDomains.add(domain);
    existingNameRegion.add(nameRegionKey);
  }
  console.log(`After dedup against ${existing.length} existing sources: ${toRegister.length} to register (${skippedDup} already registered)`);

  const byRegion = {};
  for (const r of toRegister) byRegion[r.region || 'null'] = (byRegion[r.region || 'null'] || 0) + 1;
  console.log('Per region:', JSON.stringify(byRegion, null, 2));

  console.log('\nSample rows (10):');
  for (const r of toRegister.slice(0, 10)) {
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
      notes: `registered via register-probed.mjs (confidence=${r.confidence})`,
    });
    written++;
  }
  console.log(`Wrote ${written} sources.`);
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
