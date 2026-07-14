#!/usr/bin/env node
// Weekly growth assets from the command line — the same digest the /admin/thursday
// desk shows, without a browser.
//
//   npm run digest                      # Linz: print picks + caption, no writes
//   npm run digest -- --channel wien    # another city
//   npm run digest -- --all             # every channel, one summary line each
//   npm run digest -- --cards ./out     # also save the carousel PNGs (needs the app running)
//   npm run digest -- --regenerate      # rebuild picks + AI copy, overwrite the snapshot
//   npm run digest -- --send            # mail this city's confirmed subscribers
//   npm run digest -- --test            # mail only NOTIFY_TO, to eyeball it first
//
// Sending is opt-in on purpose. The cron (.github/workflows/weekly-digest.yml)
// runs this WITHOUT --send: it prepares the snapshot and pings George. A
// newsletter nobody looked at is how you mail 500 parents a wrong event.

import fs from 'fs/promises';
import path from 'path';
import { CHANNELS, getChannel } from '../lib/city-channels.js';
import { loadOrBuildDigest, renderCaption, renderNewsletter } from '../lib/digest.js';
import { confirmedSubscribers, metaGet, metaSet } from '../lib/db.js';
import { sendNewsletter, notifyOperator } from '../lib/mail.js';
import { channelForPoint } from '../lib/city-channels.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const val = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');
const LOCAL = val('base', process.env.DIGEST_CARD_BASE || 'http://localhost:3311');

async function run(channel) {
  const digest = await loadOrBuildDigest(channel, { force: flag('regenerate'), limit: Number(val('limit', 5)) });
  const caption = renderCaption(digest);

  console.log(`\n=== ${channel.label} (${channel.handle}) · ${digest.label} ===`);
  if (!digest.items.length) {
    console.log('  no events match this weekend in this catchment.');
    return { channel, digest, sent: 0 };
  }
  for (const [i, it] of digest.items.entries()) {
    console.log(`  ${i + 1}. ${it.title}\n     ${it.when}${it.venue ? ` · ${it.venue}` : ''}${it.badges.length ? ` [${it.badges.join(', ')}]` : ''}`);
  }
  console.log(`  copy: ${digest.copyModel || 'template fallback (no AI provider configured)'}`);

  const outDir = val('cards', null);
  if (outDir) {
    await fs.mkdir(outDir, { recursive: true });
    for (let slide = 0; slide <= digest.items.length; slide++) {
      const url = `${LOCAL}/api/social/card?channel=${channel.slug}&slide=${slide}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`card ${slide} failed: ${res.status} (is the app running at ${LOCAL}?)`);
      const file = path.join(outDir, `${channel.slug}-${digest.window.friday}-${slide}.png`);
      await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
      console.log(`  → ${file}`);
    }
    const capFile = path.join(outDir, `${channel.slug}-${digest.window.friday}-caption.txt`);
    await fs.writeFile(capFile, caption);
    console.log(`  → ${capFile}`);
  } else {
    console.log(`\n--- caption ---\n${caption}\n`);
  }

  let sent = 0;
  if (flag('send') || flag('test')) {
    const key = `sent:digest:${channel.slug}:${digest.window.friday}`;
    if (flag('send') && (await metaGet(key)) && !flag('force')) {
      console.log(`  ALREADY SENT for this weekend (${await metaGet(key)}). Use --force to send again.`);
      return { channel, digest, sent: 0 };
    }
    const subs = flag('test')
      ? [{ email: process.env.NOTIFY_TO || process.env.SMTP_USER, lang: channel.lang, token: 'TEST' }]
      : (await confirmedSubscribers()).filter(
          (s) =>
            s.area_lat != null &&
            s.area_lng != null &&
            channelForPoint(Number(s.area_lat), Number(s.area_lng))?.slug === channel.slug,
        );
    for (const sub of subs) {
      const url = `${BASE}/api/subscribe/unsubscribe?token=${sub.token}&lang=${sub.lang || channel.lang}`;
      const mail = renderNewsletter(digest, { unsubscribeUrl: url });
      try {
        const ok = await sendNewsletter({ to: sub.email, ...mail, unsubscribeUrl: url });
        if (ok) sent++;
        else console.log('  SMTP not configured — nothing sent.');
      } catch (err) {
        console.error(`  send failed: ${sub.email} — ${err.message}`);
      }
    }
    // Ledger only a send that actually happened — an SMTP-less no-op must not
    // mark the weekend as mailed (it would silently skip the real send later).
    if (flag('send') && sent > 0) await metaSet(key, new Date().toISOString());
    console.log(`  sent: ${sent}${flag('test') ? ' (test)' : ` of ${subs.length}`}`);
  }

  return { channel, digest, sent };
}

const channels = flag('all') ? CHANNELS : [getChannel(val('channel', 'linz'))].filter(Boolean);
if (!channels.length) {
  console.error(`unknown channel. Known: ${CHANNELS.map((c) => c.slug).join(', ')}`);
  process.exit(1);
}

const results = [];
for (const c of channels) results.push(await run(c));

// The cron's whole job: prepare, then tell George it's ready. It never posts
// and never sends.
if (flag('notify')) {
  const lines = results.map((r) => `${r.channel.label}: ${r.digest.items.length} picks — ${r.digest.label}`);
  await notifyOperator(
    `Okolo Thursday: ${results.reduce((n, r) => n + r.digest.items.length, 0)} picks ready`,
    `${lines.join('\n')}\n\nDesk: ${BASE}/admin/thursday?token=<ADMIN_TOKEN>\n\nThe picks and the AI copy are prepared. Review, download the carousel, post, then hit Send.`,
  );
  console.log('\nnotified operator.');
}

process.exit(0);
