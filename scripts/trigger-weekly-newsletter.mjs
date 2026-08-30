#!/usr/bin/env node
// Ask the deployed Okolo app to send the already-prepared Linz digest. Delivery
// happens on Vercel so it uses the live Resend configuration and the same
// per-recipient ledger as the Thursday desk.

const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.okolo.events').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || '';
if (token.length < 16) throw new Error('ADMIN_TOKEN is required (at least 16 characters)');

const response = await fetch(`${base}/api/admin/digest`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ action: 'send', channel: 'linz', automatic: true }),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) {
  throw new Error(`automatic newsletter send failed (${response.status}): ${result.error || 'unknown error'}`);
}
if (result.failed) throw new Error(`automatic newsletter send left ${result.failed} recipient(s) unsent`);

console.log(`Linz newsletter: sent ${result.sent}, skipped ${result.skipped}, audience ${result.audience}`);
