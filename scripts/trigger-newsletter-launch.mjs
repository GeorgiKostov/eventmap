#!/usr/bin/env node
// Notify confirmed waitlist subscribers whose city edition has just launched.
// The deployed route owns recipient matching, the provider and durable ledgers.

const args = process.argv.slice(2);
const channelIndex = args.indexOf('--channel');
const channel = channelIndex >= 0 ? String(args[channelIndex + 1] || '') : '';
if (!channel) throw new Error('--channel is required');

const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.okolo.events').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || '';
if (token.length < 16) throw new Error('ADMIN_TOKEN is required (at least 16 characters)');

const response = await fetch(`${base}/api/admin/newsletter-launch`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ channel }),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`newsletter launch failed (${response.status}): ${result.error || 'unknown error'}`);
if (result.failed) throw new Error(`newsletter launch left ${result.failed} recipient(s) unsent`);
console.log(`${result.channel} launch: sent ${result.sent}, skipped ${result.skipped}, audience ${result.audience}`);
