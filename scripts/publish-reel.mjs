#!/usr/bin/env node
// Publish this weekend's reel (video/out/<slug>-<friday>.mp4) as an Instagram
// and/or Facebook Reel, next to the carousel. Same rules as publish-social.mjs:
// never builds a digest, dry-run by default when Meta isn't configured, a
// success-only ledger (`reel:<ig|fb>:<slug>:<friday>`), no --force needed for
// the normal path.
//
//   npm run reel:props -- --channel linz           # 1. export the frozen picks
//   cd video && npx remotion render WeekendReel out/linz-2026-11-20.mp4 \
//     --props=data/linz-2026-11-20.json             # 2. render (or --render below)
//   npm run reel:publish -- --channel linz --target instagram --dry-run
//   npm run reel:publish -- --channel linz --target instagram
//
// --story posts the same MP4 as a 24 h Story instead (own `story:` ledger).
// --render does step 2 for you. The script refuses a reel whose picks differ
// from the frozen digest (e.g. the desk swapped a pick after rendering).

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getChannel, CHANNELS } from '../lib/city-channels.js';
import { loadDigest, renderCaption } from '../lib/digest.js';
import { metaGet, metaSet, metaClaim, metaDelete } from '../lib/db.js';
import {
  missingSocialConfig,
  publishReelAndLedger,
  reelMatchesDigest,
  reelPostedKey,
  facebookMessage,
} from '../lib/social-publish.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const val = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};

const channel = getChannel(val('channel', 'linz'));
if (!channel) {
  console.error(`unknown channel. Known: ${CHANNELS.map((c) => c.slug).join(', ')}`);
  process.exit(1);
}
const target = val('target', null);
if (!['instagram', 'facebook'].includes(target)) {
  console.error('pass --target instagram|facebook');
  process.exit(1);
}

const digest = await loadDigest(channel);
if (!digest?.items?.length) {
  console.error(`no frozen digest with picks for ${channel.slug} this weekend — prepare it first`);
  process.exit(1);
}
const friday = digest.window.friday;
const videoDir = path.join(process.cwd(), 'video');
const propsFile = path.join(videoDir, 'data', `${channel.slug}-${friday}.json`);
const mp4 = path.join(videoDir, 'out', `${channel.slug}-${friday}.mp4`);

if (flag('render')) {
  execFileSync(process.execPath, ['--env-file=.env.local', 'scripts/reel-props.mjs', '--channel', channel.slug], { stdio: 'inherit' });
  execFileSync(
    process.execPath,
    [
      'node_modules/@remotion/cli/remotion-cli.js', 'render', 'WeekendReel', path.relative(videoDir, mp4),
      `--props=${path.relative(videoDir, propsFile)}`, '--codec=h264', '--crf=18', '--gl=angle', '--timeout=60000', '--log=error',
    ],
    { cwd: videoDir, stdio: 'inherit' },
  );
}

let props;
try {
  props = JSON.parse(await fs.readFile(propsFile, 'utf8'));
} catch {
  console.error(`no reel props at ${path.relative(process.cwd(), propsFile)} — run with --render`);
  process.exit(1);
}
const [propsStat, mp4Stat] = await Promise.all([fs.stat(propsFile), fs.stat(mp4).catch(() => null)]);
if (!mp4Stat) {
  console.error(`no rendered reel at ${path.relative(process.cwd(), mp4)} — run with --render`);
  process.exit(1);
}
if (mp4Stat.mtimeMs < propsStat.mtimeMs) {
  console.error('the MP4 is older than its props file — re-render (--render)');
  process.exit(1);
}
const reelIds = props.items.map((it) => it.id);
if (!reelMatchesDigest(digest, reelIds)) {
  console.error('REEL STALE: the rendered picks differ from the frozen digest — re-render (--render)');
  process.exit(1);
}

const format = flag('story') ? 'story' : 'reel';
const missing = missingSocialConfig(target, channel);
const dryRun = flag('dry-run') || missing.length > 0;
const caption = target === 'instagram' ? renderCaption(digest) : facebookMessage(digest);
console.log(`\n=== ${format} ${channel.handle} → ${target} · ${digest.label} ===`);
console.log(`video: ${path.relative(process.cwd(), mp4)} (${(mp4Stat.size / 1e6).toFixed(1)} MB), ${reelIds.length} picks match the digest`);
if (missing.length) console.log(`not configured: ${missing.join(', ')}`);

const already = await metaGet(reelPostedKey(target, channel.slug, friday, format));
if (already && !flag('force')) {
  console.log(`ALREADY POSTED: ${already}`);
  process.exit(0);
}
if (format === 'reel') console.log(`\ncaption:\n${caption}\n`);
if (dryRun) {
  console.log(missing.length ? '(dry run — credentials not configured)' : '(dry run — --dry-run passed)');
  process.exit(0);
}

try {
  const video = await fs.readFile(mp4);
  const record = await publishReelAndLedger({
    channel, digest, video, reelIds, target, format, force: flag('force'),
    metaGet, metaSet, metaClaim, metaDelete,
  });
  console.log(`posted: id=${record.id} permalink=${record.permalink || '(none)'}`);
} catch (err) {
  if (err.code === 'ALREADY_POSTED') {
    console.log(`ALREADY POSTED: ${JSON.stringify(err.existing)}`);
    process.exit(0);
  }
  console.error(`publish failed: ${err.message}`);
  process.exit(1);
}
process.exit(0);
