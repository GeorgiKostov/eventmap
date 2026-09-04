#!/usr/bin/env node
// Ask the deployed Okolo app to send every already-prepared live digest.
// Delivery happens on Vercel so it uses the live Resend configuration and the
// same per-recipient ledgers as the Thursday desk.
import { NEWSLETTER_EDITIONS } from '../lib/newsletter-market.js';

const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.okolo.events').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || '';
if (token.length < 16) throw new Error('ADMIN_TOKEN is required (at least 16 characters)');

const results = [];
const failures = [];
for (const channel of NEWSLETTER_EDITIONS) {
  const response = await fetch(`${base}/api/admin/digest`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'send', channel: channel.slug, automatic: true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.failed) {
    failures.push(`${channel.slug}: ${result.error || `${result.failed} recipient(s) unsent`}`);
  } else {
    results.push(`${channel.label}: sent ${result.sent}, skipped ${result.skipped}, audience ${result.audience}`);
  }
}

for (const line of results) console.log(line);
if (failures.length) throw new Error(`automatic newsletter send failed — ${failures.join('; ')}`);
