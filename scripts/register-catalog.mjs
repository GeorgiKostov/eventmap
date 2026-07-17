// Register a probed discovery catalog (data/catalog/probed-*.json) into `sources`.
//
// Replaces the ad-hoc SQL that registration used to be (tasks/todo.md, doc-agent
// finding (a)). Every gate that discovery is supposed to apply lives here, so a
// catalog can't quietly register something the crawler may not or should not fetch:
//
//   1. SCOPE     — the row's centroid must fall inside the catalog's named scope
//                  (lib/crawl-scopes.js). A scope is an explicit product decision;
//                  a row outside it is a silently widened radius.
//   2. ROBOTS    — RFC 9309, via our own parser.
//   3. AI POLICY — a site naming ClaudeBot/GPTBot with a Disallow over our path is
//                  honored even though our UA is never listed (George's Variant B,
//                  docs/decisions/2026-07-16-ai-bot-policy.md). The todo is explicit
//                  that this must be applied at DISCOVERY time or a probe keeps
//                  proposing sources we may not crawl.
//   4. OPT-OUT   — a row marked `"register": false` is a measured 0-yield trap; it
//                  is skipped with its reason printed, never silently dropped.
//
// Dry-run by default (house convention). Pass --write to actually upsert.
//
//   node --env-file=.env.local scripts/register-catalog.mjs data/catalog/probed-berlin-40km.json
//   node --env-file=.env.local scripts/register-catalog.mjs data/catalog/probed-berlin-40km.json --write
//
// Hard rule 7: registration is NOT the finish line. Each source must then survive
//   npm run crawl -- --url <url>
// before it counts as coverage.

import { readFileSync } from 'node:fs';
import { upsertSource } from '../lib/db.js';
import { robotsAllowed, aiPolicyAllowed } from '../lib/crawl-net.js';
import { scopeFromCatalog, isWithinCrawlScope, sourceCatalogPoint } from '../lib/crawl-scopes.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('usage: node --env-file=.env.local scripts/register-catalog.mjs <catalog.json> [--write]');
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(file, 'utf8'));
const scope = scopeFromCatalog(catalog);
if (!scope) {
  console.error(`No crawl scope for catalog _meta.scope="${catalog?._meta?.scope}".`);
  console.error('Add it to lib/crawl-scopes.js first — that file requires an explicit product decision per region.');
  process.exit(2);
}

const rows = catalog.proposed || [];
console.log(`catalog : ${file}`);
console.log(`scope   : ${scope.id} (${scope.country}, ${scope.radiusKm}km around ${scope.center.lat},${scope.center.lng})`);
console.log(`region  : "${scope.sourceRegion}"  · proposed rows: ${rows.length}`);
console.log(`mode    : ${write ? 'WRITE' : 'dry-run (pass --write to register)'}\n`);

const kept = [];
const skipped = [];

for (const row of rows) {
  const name = row.name || row.url;
  const label = String(name).slice(0, 44).padEnd(44);

  if (row.register === false) {
    skipped.push([name, `opted out: ${row.register_reason || 'no reason given'}`]);
    console.log(`SKIP  ${label} opted out — ${row.register_reason || 'no reason given'}`);
    continue;
  }
  const point = sourceCatalogPoint(row);
  if (!point) {
    skipped.push([name, 'no centroid — cannot prove it is in scope']);
    console.log(`SKIP  ${label} no centroid`);
    continue;
  }
  if (!isWithinCrawlScope(point, scope)) {
    skipped.push([name, 'outside scope']);
    console.log(`SKIP  ${label} outside ${scope.id}`);
    continue;
  }
  if (row.region !== scope.sourceRegion) {
    // scopeForSource() matches on this string; a mismatch means the registered
    // source silently belongs to no scope at all.
    skipped.push([name, `region "${row.region}" != scope region "${scope.sourceRegion}"`]);
    console.log(`SKIP  ${label} region mismatch ("${row.region}")`);
    continue;
  }

  const [robots, ai] = await Promise.all([robotsAllowed(row.url), aiPolicyAllowed(row.url)]);
  if (!robots) {
    skipped.push([name, 'robots.txt disallows our path']);
    console.log(`SKIP  ${label} robots.txt disallows`);
    continue;
  }
  if (!ai) {
    skipped.push([name, 'named-AI-bot policy']);
    console.log(`SKIP  ${label} named-AI-bot policy`);
    continue;
  }

  kept.push(row);
  console.log(`OK    ${label} ${row.cms || 'cms=auto'} · ${row.url}`);
  if (write) {
    await upsertSource({
      name: row.name,
      url: row.url,
      kind: row.kind || 'municipal',
      town: row.town || null,
      works: true,
      notes: row.notes || null,
      cms: row.cms || null,
      region: row.region,
      country: row.country || scope.country,
    });
  }
}

console.log(`\n${write ? 'registered' : 'would register'}: ${kept.length}   skipped: ${skipped.length}`);
for (const [n, why] of skipped) console.log(`  - ${String(n).slice(0, 50)} — ${why}`);
if (!write) console.log('\ndry run — nothing written. Re-run with --write.');
else console.log('\nHard rule 7: now verify each with  npm run crawl -- --url <url>');
process.exit(0);
