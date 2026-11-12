#!/usr/bin/env node
// Pre-publish check for a weekend issue — the shared gate any editor (George,
// Codex, Claude, a future model) runs before freezing or posting. Read-only.
// Rules: docs/ops/editorial-picks.md · code: lib/pick-policy.js.
//
//   node --env-file=.env.local scripts/check-picks.mjs                 # Linz + Wien, this weekend
//   node --env-file=.env.local scripts/check-picks.mjs --channel graz
//   node --env-file=.env.local scripts/check-picks.mjs --friday 2026-11-20
//   … --preview   # also show what a fresh build would pick now (no write)
//
// Exit code 1 when any frozen pick carries a BLOCK flag, so an automation can
// stop before publishing instead of trusting its own reading of the list.
import { getChannel, weekendWindow } from '../lib/city-channels.js';
import { loadDigestFor, poolFor, splitSections } from '../lib/digest.js';
import { weekendEventsByIds, closeDb } from '../lib/db.js';
import { pickFlags, isFamilyPick } from '../lib/pick-policy.js';
import { seasonalTheme, activeSeasonalThemes } from '../lib/seasonal-events.js';

const args = process.argv.slice(2);
const val = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const slugs = args.flatMap((a, i) => (args[i - 1] === '--channel' ? [a] : []));

const line = (e, section) => {
  const { block, warn } = pickFlags(e, { section });
  const theme = seasonalTheme(e);
  const tags = [...block.map((f) => `BLOCK:${f}`), ...warn.map((f) => `warn:${f}`), theme && `season:${theme}`].filter(Boolean);
  return { text: `${e.title} | ${e.starts_at}${e.ends_at ? `→${e.ends_at}` : ''} | ${e.venue || e.town || '?'} | ${e.source_name || '?'}${tags.length ? `  [${tags.join(' ')}]` : ''}`, blocked: block.length > 0 };
};

let blocked = 0;
try {
  for (const slug of slugs.length ? slugs : ['linz', 'wien']) {
    const channel = getChannel(slug);
    if (!channel) { console.log(`unknown channel ${slug}`); blocked++; continue; }
    const now = weekendWindow(channel.tz);
    const friday = val('friday') || now.friday;
    const sunday = new Date(Date.parse(`${friday}T12:00:00Z`) + 2 * 864e5).toISOString().slice(0, 10);
    const window = friday === now.friday ? now : { from: friday, to: sunday, friday, sunday };
    const pool = await poolFor(channel, window);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
    const seasons = activeSeasonalThemes(today);

    console.log(`\n=== ${channel.label} · weekend ${window.from}–${window.to} ===`);
    const digest = await loadDigestFor(channel, friday);
    let picked = [];
    if (!digest) console.log('No frozen issue for this weekend.');
    else {
      const rows = await weekendEventsByIds({ ids: digest.items.map((it) => it.id), lat: channel.lat, lng: channel.lng, radiusKm: channel.radiusKm, from: window.from, to: window.to });
      const byId = new Map(rows.map((r) => [String(r.id), r]));
      console.log(`Frozen issue: ${digest.items.length} picks (prepared ${digest.preparedAt || '?'})`);
      for (const it of digest.items) {
        const row = byId.get(it.id);
        if (!row) { console.log(`  ✗ [${it.section}] ${it.title}  [BLOCK:no_longer_eligible]`); blocked++; continue; }
        picked.push(row);
        const l = line(row, it.section);
        if (l.blocked) blocked++;
        console.log(`  ${l.blocked ? '✗' : '✓'} [${it.section}] ${l.text}`);
      }
    }

    // Seasons: is an active promotion represented when the pool has real events for it?
    for (const key of seasons) {
      const inPool = pool.filter((e) => seasonalTheme(e) === key);
      const inIssue = picked.filter((e) => seasonalTheme(e) === key);
      console.log(`Season ${key}: ${inPool.length} matching event(s) in pool, ${inIssue.length} in issue${inPool.length && !inIssue.length ? '  [warn:season_missing]' : ''}`);
    }

    // What the current policy would pick — the swap candidates.
    const { picks, sectionOf } = splitSections(pool, digest?.items.length || 9);
    const pickedIds = new Set(picked.map((e) => String(e.id)));
    const fresh = picks.filter((e) => !pickedIds.has(String(e.id)));
    if (args.includes('--preview') || fresh.length) {
      console.log(`Policy picks not in the issue (${fresh.length}):`);
      for (const e of fresh) console.log(`  + [${sectionOf.get(String(e.id))}] ${line(e, isFamilyPick(e) ? 'family' : 'all').text}`);
    }
  }
} finally {
  await closeDb();
}
console.log(blocked ? `\n${blocked} blocking issue(s) — swap them (desk Replace / loadDigest+saveDigest) before publishing.` : '\nNo blocking issues.');
process.exitCode = blocked ? 1 : 0;
