// Search hygiene: install the `unaccent` extension so global search folds
// diacritics — "munchen" finds "München", "cafe" finds "Café". Without it,
// searchEvents' raw ILIKE silently returns zero for the accented form.
// (Cross-SCRIPT search — Latin "Plovdiv" → Cyrillic "Пловдив" — is a separate,
// unsolved transliteration problem; unaccent only folds within a script.)
// Idempotent — safe to re-run.
// Run: node --env-file=.env.local scripts/migrate-unaccent.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
});

// Supabase convention: extensions live in the `extensions` schema, not public.
await sql`create extension if not exists unaccent with schema extensions`;

// Smoke-test that it resolves on our search_path exactly as searchEvents calls it.
const [{ folded }] = await sql`select unaccent('München') as folded`;
console.log(`unaccent ready — unaccent('München') = '${folded}'`);
await sql.end();
