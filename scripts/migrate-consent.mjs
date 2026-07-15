// Proof-of-consent + confirm-token-expiry columns on subscribers.
// Idempotent (ADD COLUMN IF NOT EXISTS + guarded backfills).
// Run: node --env-file=.env.local scripts/migrate-consent.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || '', {
  ssl: 'require',
  prepare: false,
  connection: { search_path: 'umkreis' },
});

await sql`alter table subscribers add column if not exists consent_version text`;
await sql`alter table subscribers add column if not exists consent_ip_hash text`;
await sql`alter table subscribers add column if not exists consent_at timestamptz`;
await sql`alter table subscribers add column if not exists token_issued_at timestamptz`;

// Existing rows: the row's creation time is the best evidence we have for when
// the token was issued and consent was given. consent_version stays NULL — we
// can't claim a wording version we never recorded.
await sql`update subscribers set token_issued_at = created_at where token is not null and token_issued_at is null`;
await sql`update subscribers set consent_at = created_at where consent_at is null`;

const cols = await sql`
  select column_name from information_schema.columns
  where table_schema='umkreis' and table_name='subscribers' order by ordinal_position`;
console.log('subscribers columns:', cols.map((r) => r.column_name).join(', '));
await sql.end();
