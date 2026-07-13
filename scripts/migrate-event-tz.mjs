// Add `tz` (IANA timezone, e.g. 'America/Los_Angeles') to events, so expiry
// can compare each event's own naive local wall-clock against "now" in ITS
// OWN zone — required for multi-timezone countries (US, RU, CA, AU, BR...)
// where a single per-country zone (COUNTRY_TZ) is wrong. See lib/geocode.js
// tzForEvent() (the write-path helper that fills this column going forward).
// Idempotent (IF NOT EXISTS). Run: node --env-file=.env.local scripts/migrate-event-tz.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

await sql`alter table events add column if not exists tz text`;

// Backfill: AT and BG are single-zone countries, so mapping by country here
// is exact (not an approximation) — every other/unknown country is left
// null and picked up by expireFinished()'s COALESCE fallback until a
// re-geocode or the next write fills it via tzForEvent().
const backfilled = await sql`
  update events set tz = case country
    when 'AT' then 'Europe/Vienna'
    when 'BG' then 'Europe/Sofia'
    else tz
  end
  where tz is null and country in ('AT','BG')
`;

const counts = await sql`
  select country, tz, count(*)::int as n from events group by country, tz order by country, tz
`;
console.log(`tz column present. backfilled ${backfilled.count} rows.`);
console.log('row counts by country/tz:', counts);
await sql.end();
