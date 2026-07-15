#!/usr/bin/env node
// Publish the weekly digest to Instagram/Facebook from the command line — the
// same publish the /admin/thursday desk buttons trigger, without a browser.
//
//   npm run social -- --channel linz --target instagram --dry-run
//   npm run social -- --channel linz --target facebook
//   npm run social -- --channel linz --target instagram --force
//
// Requires a frozen digest snapshot to already exist (prepare it first with
// `npm run digest -- --channel linz` or on the desk) — this script never
// builds one, same rule as the API route: publishing must not trigger a
// build/AI call.
//
// --dry-run prints the image URLs + caption + where it would post, no Graph
// call. It's also the default when META_* env isn't configured, so this is
// always safe to run without credentials.

import { getChannel, CHANNELS } from '../lib/city-channels.js';
import { loadDigest, renderCaption } from '../lib/digest.js';
import { metaGet, metaSet, metaClaim, metaDelete } from '../lib/db.js';
import {
  socialConfigured,
  missingSocialEnv,
  cardUrls,
  postedKey,
  publishAndLedger,
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
if (!digest) {
  console.error(`no digest snapshot for ${channel.slug} this weekend — prepare it first: npm run digest -- --channel ${channel.slug}`);
  process.exit(1);
}
if (!digest.items.length) {
  console.error('digest has no items to post');
  process.exit(1);
}

const configured = socialConfigured();
const missing = missingSocialEnv(target);
const dryRun = flag('dry-run') || missing.length > 0;

const imageUrls = cardUrls(channel, digest);
const message = target === 'facebook' ? facebookMessage(digest) : renderCaption(digest);

console.log(`\n=== ${channel.label} (${channel.handle}) → ${target} · ${digest.label} ===`);
console.log(`configured: instagram=${configured.instagram} facebook=${configured.facebook}`);
if (missing.length) console.log(`missing env: ${missing.join(', ')}`);

const key = postedKey(target, channel.slug, digest.window.friday);
const already = await metaGet(key);
if (already && !flag('force')) {
  console.log(`ALREADY POSTED for this weekend: ${already}`);
  console.log('Use --force to re-post.');
  process.exit(0);
}

console.log(`\nimages (${imageUrls.length}):`);
imageUrls.forEach((u) => console.log(`  ${u}`));
console.log(`\ncaption:\n${message}\n`);

if (dryRun) {
  console.log(missing.length ? '(dry run — credentials not configured)' : '(dry run — --dry-run passed)');
  process.exit(0);
}

try {
  const record = await publishAndLedger({
    channel, digest, target, force: flag('force'),
    metaGet, metaSet, metaClaim, metaDelete,
  });
  console.log(`posted: id=${record.id} permalink=${record.permalink || '(none)'}`);
  if (record.warning) console.warn(`WARNING: ${record.warning}`);
} catch (err) {
  if (err.code === 'ALREADY_POSTED') {
    console.log(`ALREADY POSTED for this weekend: ${JSON.stringify(err.existing)}`);
    process.exit(0);
  }
  console.error(`publish failed: ${err.message}`);
  process.exit(1);
}

process.exit(0);
