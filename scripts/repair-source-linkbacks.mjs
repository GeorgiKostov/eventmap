// Repair legacy published linkbacks that were relative paths or mail/tel URIs.
// Relative paths resolve against the unique registered source URL; pseudo-links
// fall back to that fetched source page. Ambiguous rows are left untouched.
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  prepare: false, max: 1, connection: { search_path: 'umkreis' },
});
const events = await sql`
  SELECT id, source_name, source_url, country
  FROM events
  WHERE status='published' AND source_url IS NOT NULL AND source_url !~ '^https?://'
`;
const sources = await sql`SELECT name, url, country FROM sources`;
const byName = new Map();
for (const source of sources) {
  const key = `${source.country || 'AT'}|${source.name}`;
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(source.url);
}

let repaired = 0, ambiguous = 0;
for (const event of events) {
  const bases = [...new Set(byName.get(`${event.country || 'AT'}|${event.source_name}`) || [])];
  if (bases.length !== 1) { ambiguous++; continue; }
  let link;
  try {
    const parsed = new URL(event.source_url, bases[0]);
    link = /^https?:$/.test(parsed.protocol) ? parsed.toString() : bases[0];
  } catch {
    link = bases[0];
  }
  await sql`UPDATE events SET source_url=${link} WHERE id=${event.id}`;
  repaired++;
}
console.log(`Legacy linkbacks repaired: ${repaired}; ambiguous and unchanged: ${ambiguous}.`);
await sql.end();
