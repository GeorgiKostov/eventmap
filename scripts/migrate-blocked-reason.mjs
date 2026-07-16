// Idempotent: sources.blocked_reason — a STATE ('robots' | 'ai_bot_policy' |
// 'js_spa' | 'bot_block' | null), not a failure streak
// (docs/design/big-city-quality.md §2). Before this column existed, a
// robots-disallow skip was recorded as an ordinary zero-yield round
// (setSourceNote + zero_streak+1), so "we may not crawl this" and "there is
// nothing here" were indistinguishable and the source marched toward
// tier='dead' just for being polite (the Stuttgart case, tasks/lessons.md
// 2026-07-14). scripts/crawl.mjs now sets this on a robots-disallow skip and
// clears it once a fetch succeeds again; js_spa/ai_bot_policy/bot_block are
// set by hand or by the CMS fingerprint sweep, never auto-detected in the
// crawl itself.
// Usage: node --env-file=.env.local scripts/migrate-blocked-reason.mjs
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

await sql`alter table sources add column if not exists blocked_reason text`;

const [{ n }] = await sql`select count(*)::int as n from sources where blocked_reason is not null`;
console.log(`sources.blocked_reason ready (${n} row(s) already flagged)`);
await sql.end();
