import { publishedEvents } from '../lib/db.js';

export const dynamic = 'force-dynamic';

export default async function sitemap() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events';
  const events = (await publishedEvents()).map((ev) => ({
    url: `${base}/event/${ev.id}`,
    lastModified: new Date(ev.updated_at || ev.created_at || Date.now()),
    changeFrequency: 'daily',
    priority: 0.8,
  }));
  return [{ url: base, changeFrequency: 'hourly', priority: 1 }, ...events];
}
