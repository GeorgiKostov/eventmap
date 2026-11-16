// Unpublish exact duplicate occurrences among UPCOMING published events: same
// normalised title, same starts_at, and the same place (same town, a town that
// is a district of the other — "Linz" / "Linz-Urfahr" — or pins within 1.5 km).
// The 2026-11-16 audit found ~480 (FRida & freD twice per slot, Alpenverein
// Linz rows under both Linz and Linz-Urfahr, Enns exhibitions twice a day).
// merge-dups.mjs is the fuzzy O(n²) pass; this is the cheap exact one.
//
// Keeps the best row per cluster (venue/address precision, then a description,
// then categories, then the oldest id) and sets the rest to status='removed' —
// reversible, and a recrawl's content_hash match keeps them removed.
// Dry run unless --write.
//
// Usage: node --env-file=.env.local scripts/unpublish-exact-dups.mjs [--write]
import postgres from 'postgres';

const write = process.argv.includes('--write');
const show = process.argv.includes('--show'); // print clusters whose rows name different towns
let shown = 0;
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2 });
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna' }).format(new Date());
const PREC = { venue: 3, address: 3, street: 2, town: 1 };
const norm = (s) => String(s || '').normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const km = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};
const samePlace = (a, b) => {
  const ta = norm(a.town), tb = norm(b.town);
  // Distance alone only merges rows from the SAME publisher ("Kottes" vs "Kottes-Purk");
  // two municipalities' "Adventkonzert" at the same hour 1 km apart may be two concerts.
  return ta === tb || (ta && tb && (ta.startsWith(tb) || tb.startsWith(ta)))
    || (a.source_name === b.source_name && km(a, b) <= 1.5);
};
const score = (e) => [PREC[e.geo_precision] || 0, (e.description || '').length >= 30 ? 1 : 0, e.categories?.length ? 1 : 0, -Number(e.id)];
const better = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

try {
  const rows = await sql`SELECT id, title, starts_at, town, lat, lng, geo_precision, description, categories, source_name
    FROM events WHERE status='published' AND kind='event' AND coalesce(ends_at, starts_at) >= ${today}`;
  const groups = new Map();
  for (const r of rows) {
    const k = `${norm(r.title)}|${r.starts_at}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const drop = [];
  const bySource = {};
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const left = [...g];
    while (left.length) {
      const seed = left.shift();
      const cluster = [seed, ...left.filter((x) => samePlace(seed, x))];
      for (const x of cluster.slice(1)) left.splice(left.indexOf(x), 1);
      if (cluster.length < 2) continue;
      const keep = cluster.reduce((a, b) => (better(b, a) ? b : a));
      if (show && shown < 40 && new Set(cluster.map((x) => x.town)).size > 1) {
        shown++;
        console.log(cluster.map((x) => `${x === keep ? 'KEEP' : 'drop'} #${x.id} ${x.title.slice(0, 45)} | ${x.starts_at} | ${x.town} | ${x.geo_precision} | ${x.source_name}`).join('\n') + '\n');
      }
      for (const x of cluster) if (x !== keep) { drop.push(x.id); bySource[x.source_name] = (bySource[x.source_name] || 0) + 1; }
    }
  }
  for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${String(n).padStart(4)}  ${s}`);
  console.log(`\n${drop.length} duplicate row(s) among ${rows.length} upcoming.`);
  if (write && drop.length) {
    const res = await sql`UPDATE events SET status='removed', updated_at=now() WHERE id = ANY(${drop}::bigint[]) AND status='published'`;
    console.log(`Unpublished ${res.count}.`);
  } else if (!write) console.log('Dry run — pass --write to unpublish.');
} finally { await sql.end(); }
