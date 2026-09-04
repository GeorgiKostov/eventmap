// Separate a recurring newsletter edition from a one-time city launch notice.
// Idempotent. Run before deploying code that writes/reads these columns:
//   node --env-file=.env.local scripts/migrate-newsletter-editions.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis, extensions' },
});

await sql`alter table subscribers add column if not exists area_country text`;
await sql`alter table subscribers add column if not exists subscription_kind text not null default 'waitlist'`;
await sql`alter table subscribers add column if not exists channel_slug text`;

// Existing rows inside the one edition that is genuinely live keep receiving
// Linz. Every other row becomes a launch-notification waitlist entry. Run this
// classification exactly once: a later re-run must never overwrite a person's
// explicit preference change.
const backfillKey = 'migration:newsletter-editions-v1';
const backfilled = await sql`select value from meta where key=${backfillKey}`;
if (!backfilled[0]) {
  await sql`update subscribers set subscription_kind='waitlist', channel_slug=null`;
  await sql`
    update subscribers
    set subscription_kind='edition', channel_slug='linz', area_country=coalesce(area_country, 'AT')
    where area_lat is not null and area_lng is not null
      and ST_DWithin(
        ST_SetSRID(ST_MakePoint(area_lng, area_lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(14.2858, 48.3069), 4326)::geography,
        40000
      )
  `;
  await sql`update subscribers set area_country='BG' where area_country is null and area_lat between 41 and 45 and area_lng between 22 and 29`;
  await sql`update subscribers set area_country='AT' where area_country is null and area_lat between 46.3 and 49.1 and area_lng between 9.4 and 17.3`;
  await sql`update subscribers set area_country='DE' where area_country is null and area_lat between 47 and 55.2 and area_lng between 5.5 and 15.6`;
  await sql`insert into meta (key, value) values (${backfillKey}, ${new Date().toISOString()}) on conflict (key) do nothing`;
}

await sql`alter table subscribers drop constraint if exists subscribers_subscription_kind_check`;
await sql`alter table subscribers add constraint subscribers_subscription_kind_check check (subscription_kind in ('edition', 'waitlist'))`;
await sql`alter table subscribers drop constraint if exists subscribers_subscription_target_check`;
await sql`alter table subscribers add constraint subscribers_subscription_target_check check (
  (subscription_kind = 'edition' and channel_slug is not null)
  or (subscription_kind = 'waitlist' and channel_slug is null)
)`;

const summary = await sql`
  select subscription_kind, channel_slug, count(*)::int as count
  from subscribers group by subscription_kind, channel_slug order by subscription_kind, channel_slug
`;
console.log('newsletter preferences:', summary);
await sql.end();
