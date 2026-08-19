#!/usr/bin/env node
// Consolidate two source-verified duplicate clusters surfaced by the Search
// Console audit. Dry-run by default; --write retires aliases reversibly.
// Usage: node --env-file=.env.local scripts/merge-search-index-dups.mjs [--write]

import postgres from 'postgres';
import { EVENT_ALIAS_IDS } from '../lib/event-aliases.js';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

const WRITE = process.argv.includes('--write');
const CLUSTERS = [
  {
    keep: '22241',
    retire: ['22229', '34677', '34769', '34892'],
    day: '2026-08-25',
    description: 'Premiere der Oper „Ein Maskenball“ beim Varna Summer Festival mit Krasimira Stoyanova im Sommertheater Varna.',
  },
  {
    keep: '1146',
    retire: ['2253', '12822', '44999', '73592', '12664'],
    day: '2026-08-19',
    description: 'Das Festkonzert zum 70-jährigen Jubiläum des OÖ Seniorenbundes findet im Mariendom Linz statt.',
  },
];

const expectedAliases = CLUSTERS.flatMap((cluster) => cluster.retire).sort();
if (expectedAliases.join(',') !== [...EVENT_ALIAS_IDS].sort().join(',')) {
  throw new Error('redirect aliases and database retirement plan differ');
}

const allIds = CLUSTERS.flatMap((cluster) => [cluster.keep, ...cluster.retire]);
const rows = await sql`
  SELECT id, title, status, starts_at, town, venue
  FROM events WHERE id IN ${sql(allIds)} ORDER BY id`;
if (rows.length !== allIds.length) throw new Error(`expected ${allIds.length} rows, found ${rows.length}`);

for (const cluster of CLUSTERS) {
  const members = rows.filter((row) => row.id === cluster.keep || cluster.retire.includes(row.id));
  if (members.some((row) => row.starts_at?.slice(0, 10) !== cluster.day)) {
    throw new Error(`date guard failed for canonical ${cluster.keep}`);
  }
  console.log(`canonical ${cluster.keep}: ${members.find((row) => row.id === cluster.keep).title}`);
  for (const row of members.filter((member) => member.id !== cluster.keep)) {
    console.log(`  ${WRITE ? 'retire' : 'would retire'} ${row.id}: ${row.title} (${row.town})`);
  }
  if (WRITE) {
    await sql`
      UPDATE events SET description=COALESCE(description, ${cluster.description}), updated_at=now()
      WHERE id=${cluster.keep}`;
    await sql`
      UPDATE events SET status='removed', updated_at=now()
      WHERE id IN ${sql(cluster.retire)}`;
  }
}

const after = await sql`
  SELECT id, status, title, starts_at, town, venue
  FROM events WHERE id IN ${sql(allIds)} ORDER BY id`;
console.log(JSON.stringify(after, null, 2));
await sql.end();
