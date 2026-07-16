// Read-only rot detector: which registered (works=true) sources need a
// human's attention, grouped by tier. Never writes anything; always exits 0 —
// a flag here is information for the outreach/fingerprint-sweep backlog, not
// a pass/fail check. Companion to the crawl's own end-of-run summary.
// See docs/design/big-city-quality.md §2 and §5 item 4, tasks/lessons.md
// 2026-07-14 (blocked_reason as a state) and 2026-07-15 (record WHAT failed).
//
// Four flags:
//   stale        — last_crawled is more than 2x this source's tier cadence ago
//                   (TIER_CADENCE_DAYS, imported from crawl.mjs so the two
//                   never drift apart)
//   zero_streak  — zero_streak >= 3 (one short of the dead threshold)
//   blocked      — blocked_reason is set (robots/ai_bot_policy/js_spa/bot_block)
//   honest-zero  — events_last=0 with crawl_count >= 3: a source that has had
//                   a fair shot and genuinely seems to publish nothing right
//                   now, worth a human glance rather than assuming it's broken
//
// Usage: node --env-file=.env.local scripts/rot-report.mjs
import { getWorkingSources, closeDb } from '../lib/db.js';
import { TIER_CADENCE_DAYS } from './crawl.mjs';

const DAY_MS = 86400000;
const ZERO_STREAK_MIN = 3;
const HONEST_ZERO_MIN_CRAWLS = 3;

function cadenceFor(tier) {
  return TIER_CADENCE_DAYS[tier] ?? TIER_CADENCE_DAYS.active;
}

function daysSince(ts) {
  return ts ? (Date.now() - new Date(ts).getTime()) / DAY_MS : null;
}

function flagsFor(src) {
  const flags = [];
  const age = daysSince(src.last_crawled);
  const cadence = cadenceFor(src.tier);
  if (age != null && age > cadence * 2) flags.push(`stale(${age.toFixed(0)}d, cadence ${cadence}d)`);
  if ((src.zero_streak || 0) >= ZERO_STREAK_MIN) flags.push(`zero_streak=${src.zero_streak}`);
  if (src.blocked_reason) flags.push(`blocked:${src.blocked_reason}`);
  if ((src.events_last ?? null) === 0 && (src.crawl_count || 0) >= HONEST_ZERO_MIN_CRAWLS) flags.push('honest-zero');
  return flags;
}

function truncate(s, n) {
  const str = s || '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

async function main() {
  const sources = await getWorkingSources();
  const flagged = sources
    .map((src) => ({ src, flags: flagsFor(src) }))
    .filter((r) => r.flags.length);

  console.log(`${sources.length} working source(s) checked, ${flagged.length} flagged.\n`);

  const tiers = ['active', 'slow', 'dormant', 'dead', null];
  for (const tier of tiers) {
    const rows = flagged.filter((r) => (r.src.tier || null) === tier);
    if (!rows.length) continue;
    console.log(`--- tier: ${tier ?? '(unrated)'} — ${rows.length} flagged ---`);
    console.log(
      `${'name'.padEnd(36)} ${'town'.padEnd(16)} ${'crawled'.padEnd(9)} ${'zero'.padEnd(4)} `
      + `${'ev/n'.padEnd(7)} ${'blocked'.padEnd(13)} flags`,
    );
    for (const { src, flags } of rows.sort((a, b) => b.flags.length - a.flags.length)) {
      const age = daysSince(src.last_crawled);
      console.log(
        `${truncate(src.name, 36).padEnd(36)} ${truncate(src.town, 16).padEnd(16)} `
        + `${(age == null ? 'never' : `${age.toFixed(0)}d`).padEnd(9)} `
        + `${String(src.zero_streak ?? 0).padEnd(4)} `
        + `${`${src.events_last ?? '?'}/${src.crawl_count ?? 0}`.padEnd(7)} `
        + `${(src.blocked_reason || '-').padEnd(13)} ${flags.join(', ')}`,
      );
    }
    console.log('');
  }

  const counts = { stale: 0, zeroStreak: 0, blocked: 0, honestZero: 0 };
  for (const { flags } of flagged) {
    if (flags.some((f) => f.startsWith('stale'))) counts.stale++;
    if (flags.some((f) => f.startsWith('zero_streak'))) counts.zeroStreak++;
    if (flags.some((f) => f.startsWith('blocked'))) counts.blocked++;
    if (flags.includes('honest-zero')) counts.honestZero++;
  }
  console.log(
    `Summary — stale: ${counts.stale}, zero_streak>=${ZERO_STREAK_MIN}: ${counts.zeroStreak}, `
    + `blocked: ${counts.blocked}, honest-zero (events_last=0 & crawl_count>=${HONEST_ZERO_MIN_CRAWLS}): ${counts.honestZero}`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(closeDb);
// Deliberately no process.exitCode write anywhere above: this is a report,
// not a gate, and must always exit 0 (per this script's own header).
