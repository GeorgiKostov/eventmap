// One-shot data import: execute a .sql file against the Supabase `umkreis`
// schema. Used to migrate the prototype's seeded events out of the old SQLite
// bundle without re-geocoding. Usage: npm run seed:sql -- path/to/seed.sql
import fs from 'fs';
import postgres from 'postgres';

const file = process.argv[2];
if (!file) { console.error('Usage: npm run seed:sql -- <path-to.sql>'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set (see .env.example).'); process.exit(1); }

const sqlText = fs.readFileSync(file, 'utf8');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });

try {
  await sql.unsafe(sqlText); // multi-statement file; runs via simple query protocol
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM umkreis.events`;
  console.log(`Import done. umkreis.events now has ${count} rows.`);
} catch (e) {
  console.error('Import failed:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
