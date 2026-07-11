// One-off migration: opening_hours semantics changed from
// `null = always open` to `{"always":true} = always open, null = unknown`
// (see app/page.js openStatus()). The 57 seeded family places mostly have
// opening_hours=null meaning UNKNOWN, not always-open — leaving them null
// is correct (renders no status line). Only a couple of places are
// genuinely always-open outdoor spots and need the explicit marker.
//
// Usage: node --env-file=.env.local scripts/fix-always-open.mjs
import postgres from 'postgres';

const ALWAYS_OPEN_TITLES = ['Spielplatz Donaulände', 'Kürnberger Wald Wanderweg'];

async function main() {
  const sql = postgres(process.env.DATABASE_URL || '', {
    ssl: 'require', prepare: false, connection: { search_path: 'umkreis' }, max: 2,
  });
  try {
    const rows = await sql`
      UPDATE events
      SET opening_hours = '{"always":true}'::jsonb, updated_at = now()
      WHERE kind = 'place' AND opening_hours IS NULL AND title = ANY(${ALWAYS_OPEN_TITLES})
      RETURNING id, title
    `;
    if (!rows.length) {
      console.log('No rows matched (already migrated or titles not found).');
    } else {
      console.log(`Updated ${rows.length} row(s):`);
      for (const r of rows) console.log(`  [${r.id}] ${r.title} -> opening_hours = {"always": true}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
