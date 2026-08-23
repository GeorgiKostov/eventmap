// Idempotent 2026-08-23 authorization/dedup repair for the Sofia source set.
// Keeps history/events intact; only recurring crawl eligibility is changed.
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  prepare: false, max: 1, connection: { search_path: 'umkreis' },
});

const changes = [
  {
    ids: [1092, 1115, 1116, 1117, 1131, 2352],
    note: '2026-08-23: superseded by canonical deterministic Visit Sofia JEvents source id 1964; do not recur.',
  },
  {
    ids: [1095, 1186, 2340, 2343],
    note: '2026-08-23: paused pending written permission; operasofia.bg terms §77 restrict use to develop/provide another service without contract.',
  },
  {
    ids: [2345],
    note: '2026-08-23: paused pending written permission; SGHG terms §§3/9 restrict non-personal reuse and use to provide another service.',
  },
  {
    ids: [1187, 2342],
    note: '2026-08-23: paused pending authorization clarification; duplicate ArtSofia rows, no usable robots policy and all-rights-reserved notice.',
  },
  {
    ids: [2356, 2357, 2502, 2738, 2739, 2740],
    note: '2026-08-23: paused; commercial ticketing/editorial aggregator is outside the approved recurring source classes.',
  },
  {
    ids: [2503],
    note: '2026-08-23: old AI-bot block is stale; robots permits search/reference, but keep paused until the Windows-1251 monthly program has a deterministic adapter.',
    clearBlocked: true,
  },
];

let updated = 0;
for (const change of changes) {
  const rows = await sql`
    UPDATE sources
    SET works=false,
        blocked_reason=${change.clearBlocked ? null : sql`blocked_reason`},
        notes=${change.note}
    WHERE id = ANY(${change.ids})
    RETURNING id, url
  `;
  updated += rows.length;
}

console.log(`Sofia source registry repaired: ${updated} row(s) paused; canonical source 1964 retained.`);
await sql.end();
