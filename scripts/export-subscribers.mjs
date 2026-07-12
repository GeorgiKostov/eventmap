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
  SELECT email, source, lang, area_label, area_lat, area_lng, radius_km, categories, created_at
  FROM subscribers
  WHERE unsubscribed_at IS NULL
  ORDER BY created_at DESC
`;

const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
console.log('email,source,lang,area_label,area_lat,area_lng,radius_km,categories,created_at');
for (const r of rows) {
  const created = r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at;
  console.log([
    r.email,
    r.source,
    r.lang,
    r.area_label,
    r.area_lat,
    r.area_lng,
    r.radius_km,
    (r.categories || []).join('|'),
    created,
  ].map(csv).join(','));
}
console.error(`\n${rows.length} active subscriber(s).`);
await sql.end();
