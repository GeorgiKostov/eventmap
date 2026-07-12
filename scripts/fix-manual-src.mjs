// One-off: the 3 hand-curated Linz places (Parkbad, Spielplatz Donaulände,
// Kürnberger Wald) were seeded as src_kind='manual' with source_name
// 'Manuell hinzugefügt', which the new marker grammar mis-read as
// community-submitted. They are public-location facts, so relabel them to the
// same OSM attribution the other 57 family places use. Idempotent.
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

const before = await sql`select id, title, src_kind, source_name from events where src_kind = 'manual'`;
console.log('rows to fix:', before.map((r) => `${r.id} ${r.title} [${r.source_name}]`));

const res = await sql`
  update events
  set src_kind = 'osm_mined', source_name = 'OpenStreetMap contributors', updated_at = now()
  where src_kind = 'manual'
  returning id, title
`;
console.log('updated', res.length, 'rows:', res.map((r) => r.title));

await sql.end();
