// Dump the current newsletter list as CSV. Run:
//   npm run subscribers            # prints CSV to stdout
//   npm run subscribers > subs.csv # save to a file
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

const rows = await sql`
  SELECT email, source, lang, created_at
  FROM subscribers
  WHERE unsubscribed_at IS NULL
  ORDER BY created_at DESC
`;

console.log('email,source,lang,created_at');
for (const r of rows) {
  const created = r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at;
  console.log(`${r.email},${r.source || ''},${r.lang || ''},${created}`);
}
console.error(`\n${rows.length} active subscriber(s).`);
await sql.end();
