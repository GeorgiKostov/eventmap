#!/usr/bin/env node
// Send the one-time edition/city selection email through the deployed app. The
// live app owns the working mail provider and a durable per-recipient ledger.

const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.okolo.events').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || '';
if (token.length < 16) throw new Error('ADMIN_TOKEN is required (at least 16 characters)');

const response = await fetch(`${base}/api/admin/newsletter-preferences`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: '{}',
});
const result = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(`newsletter preferences send failed (${response.status}): ${result.error || 'unknown error'}`);
}
if (result.failed) throw new Error(`newsletter preferences send left ${result.failed} recipient(s) unsent`);
console.log(`Newsletter preferences: sent ${result.sent}, skipped ${result.skipped}, audience ${result.audience}`);
