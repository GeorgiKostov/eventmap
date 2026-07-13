// Turns scripts/probe-sources.mjs output into registered `sources` rows.
// Registration policy (Architect-approved, 2026-07-12): confidence='high'
// (any cms) + confidence='medium' with a verified structured CMS
// ('gem2go','ris','dvv'). Everything
// else (low/none/unknown-medium) is LLM-review residue, skipped for now.
//
// Usage: node --env-file=.env.local scripts/register-probed.mjs
//          [--file data/catalog/probed-all-1823.json]  (dry run: counts + samples)
//        node --env-file=.env.local scripts/register-probed.mjs --write
import fs from 'fs';
import path from 'path';
import { listSourcesForDedup, upsertSource, closeDb } from '../lib/db.js';
import {
  CRAWL_SCOPES, isWithinCrawlScope, scopeFromCatalog, sourceCatalogPoint,
} from '../lib/crawl-scopes.js';

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
  if (r.confidence === 'medium' && ['gem2go', 'ris', 'dvv'].includes(r.cms)) return true;
  // BG has no gem2go/ris; its sources are confirmed-working listing pages from
  // the crawl, so accept medium there too (high is already covered above).
  if (r.country === 'BG' && r.confidence === 'medium') return true;
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.join(process.cwd(), args.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const scopeId = data?._meta?.scope || data?.scope || null;
  const scope = scopeFromCatalog(data);
  if (scopeId && !scope) {
    throw new Error(`Unknown crawl scope "${scopeId}". Known scopes: ${Object.keys(CRAWL_SCOPES).join(', ')}`);
  }
  const proposed = (data.proposed || []).map((r) => ({
    ...r,
    country: r.country || data.country || scope?.country || 'AT',
  }));
  console.log(`Loaded ${proposed.length} probed rows from ${args.file}`);

  let selected = proposed.filter(passesPolicy);
  console.log(`Policy-selected: ${selected.length} (high=${proposed.filter((r) => r.confidence === 'high').length}, `
    + `medium+structured-cms=${proposed.filter((r) => r.confidence === 'medium' && ['gem2go', 'ris', 'dvv'].includes(r.cms)).length})`);

  if (scope) {
    const rejected = { country: 0, region: 0, coordinates: 0, radius: 0 };
    selected = selected.filter((r) => {
      if (r.country !== scope.country) { rejected.country++; return false; }
      if (r.region !== scope.sourceRegion) { rejected.region++; return false; }
      const point = sourceCatalogPoint(r);
      if (!point) { rejected.coordinates++; return false; }
      if (!isWithinCrawlScope(point, scope)) { rejected.radius++; return false; }
      return true;
    });
    console.log(`Scope ${scope.id}: ${selected.length} source(s) within ${scope.radiusKm} km; rejected ${JSON.stringify(rejected)}`);
  }

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
      kind: r.kind || 'municipal',
      town: r.town || null,
      works: true,
      cms: r.cms || null,
      region: r.region || null,
      country: r.country,
      notes: [r.notes, `registered via register-probed.mjs (confidence=${r.confidence})`].filter(Boolean).join('; '),
    });
    written++;
  }
  console.log(`Wrote ${written} sources.`);
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
