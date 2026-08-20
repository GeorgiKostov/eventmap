// Purge Vercel's ISR cache for the server-rendered acquisition pages after a
// crawl. The token is sent as a header, never placed in the URL.
const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.okolo.events').replace(/\/$/, '');
const token = process.env.ADMIN_TOKEN || '';
if (token.length < 16) {
  throw new Error('ADMIN_TOKEN is required (at least 16 characters).');
}

const response = await fetch(`${base}/api/admin/revalidate`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
});

if (!response.ok) {
  throw new Error(`SEO revalidation failed (${response.status}): ${await response.text()}`);
}

console.log(`SEO pages revalidated: ${base}/events`);
