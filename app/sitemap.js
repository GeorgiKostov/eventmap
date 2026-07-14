import { publishedEvents, listDigestKeys } from '../lib/db.js';
import { CHANNELS } from '../lib/city-channels.js';

export const dynamic = 'force-dynamic';

export default async function sitemap() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events';

  const events = (await publishedEvents()).map((ev) => ({
    url: `${base}/event/${ev.id}`,
    lastModified: new Date(ev.updated_at || ev.created_at || Date.now()),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // Every weekend digest we publish is a permanent page. The newest one is the
  // strongest page on the site for "what's on this weekend" — fresh, local, and
  // the query people actually type — so it gets the highest priority. Past
  // weekends stay listed: they keep whatever inbound links they earned.
  const known = new Set(CHANNELS.map((c) => c.slug));
  const digests = (await listDigestKeys())
    .filter((k) => known.has(k.slug))
    .map(({ slug, friday }, i) => ({
      url: `${base}/weekend/${slug}/${friday}`,
      lastModified: new Date(`${friday}T12:00:00Z`),
      changeFrequency: 'weekly',
      priority: i === 0 ? 0.9 : 0.5,
    }));

  // The stable per-city link (/weekend/linz always shows the current weekend) —
  // this is the URL that goes in a bio, a QR poster, or a group message.
  const cityIndexes = CHANNELS.map((c) => ({
    url: `${base}/weekend/${c.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    ...cityIndexes,
    ...digests,
    ...events,
  ];
}
