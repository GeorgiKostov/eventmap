// Compare exact per-table row counts of the `umkreis` schema between two
// Postgres databases — used to verify the Supabase → Neon copy (2026-11).
//   SOURCE_DATABASE_URL=<old> TARGET_DATABASE_URL=<new> node scripts/compare-db-copy.mjs
// Exits 1 on any mismatch or missing table. Read-only on both sides.
import postgres from 'postgres';

const { SOURCE_DATABASE_URL, TARGET_DATABASE_URL } = process.env;
if (!SOURCE_DATABASE_URL || !TARGET_DATABASE_URL) {
  console.error('Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL.');
  process.exit(2);
}

async function counts(url) {
  const sql = postgres(url, { prepare: false, max: 1, ssl: 'require' });
  try {
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='umkreis' AND table_type='BASE TABLE' ORDER BY table_name
    `;
    const out = {};
    for (const { table_name: t } of tables) {
      const [{ n }] = await sql`SELECT count(*)::bigint AS n FROM ${sql('umkreis')}.${sql(t)}`;
      out[t] = Number(n);
    }
    const [{ v }] = await sql`SELECT extversion AS v FROM pg_extension WHERE extname='postgis'`.catch(() => [{ v: null }]);
    return { tables: out, postgis: v ?? null };
  } finally {
    await sql.end();
  }
}

const [src, dst] = await Promise.all([counts(SOURCE_DATABASE_URL), counts(TARGET_DATABASE_URL)]);
let bad = 0;
for (const t of new Set([...Object.keys(src.tables), ...Object.keys(dst.tables)])) {
  const a = src.tables[t];
  const b = dst.tables[t];
  const ok = a === b;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'DIFF'} ${t.padEnd(22)} source=${a ?? 'missing'} target=${b ?? 'missing'}`);
}
console.log(`postgis source=${src.postgis} target=${dst.postgis}`);
if (!dst.postgis) bad++;
console.log(bad ? `${bad} problem(s)` : 'All umkreis tables match.');
process.exit(bad ? 1 : 0);
