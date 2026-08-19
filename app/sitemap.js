import { sitemapEvents, listDigestKeys, seoWindowManifest } from '../lib/db.js';
import { CHANNELS, weekendWindow } from '../lib/city-channels.js';
import { publicBaseUrl } from '../lib/public-url.js';
import {
  SEO_CITIES,
  SEO_MONTHS_TO_PREGENERATE,
  cityIntentPath,
  cityMonthPath,
  cityPageRange,
  cityPath,
  isIndexableEventCount,
  monthRange,
  todayRange,
  upcomingMonthSlugs,
} from '../lib/seo-pages.js';

// Event URLs change on the crawl cadence, not per request. Cache the minimal
// id/timestamp projection so crawler retries cannot repeatedly hit Postgres.
export const revalidate = 86400;

export default async function sitemap() {
  const base = publicBaseUrl();

  const events = (await sitemapEvents({ cities: SEO_CITIES })).map((ev) => ({
    url: `${base}/event/${ev.id}`,
    lastModified: new Date(ev.updated_at || Date.now()),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // Every weekend digest we publish is a permanent page. The newest one is the
  // strongest page on the site for "what's on this weekend" — fresh, local, and
  // the query people actually type — so it gets the highest priority. Past
  // weekends stay listed: they keep whatever inbound links they earned.
  const known = new Set(CHANNELS.map((c) => c.slug));
  const currentFriday = weekendWindow('Europe/Vienna').friday;
  const digests = (await listDigestKeys())
    .filter((k) => known.has(k.slug))
    .map(({ slug, friday }) => ({
      url: `${base}/weekend/${slug}/${friday}`,
      // Future issues are prepared early for indexing; their last-modified date
      // is today, not a timestamp from the future that can confuse crawlers.
      lastModified: new Date(Math.min(Date.now(), new Date(`${friday}T12:00:00Z`).getTime())),
      changeFrequency: 'weekly',
      priority: friday === currentFriday ? 0.9 : friday > currentFriday ? 0.6 : 0.5,
    }));

  // The stable per-city link (/weekend/linz always shows the current weekend) —
  // this is the URL that goes in a bio, a QR poster, or a group message.
  const cityIndexes = CHANNELS.filter((c) => c.country !== 'AT').map((c) => ({
    url: `${base}/weekend/${c.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Pre-compute the moving SEO matrix in one bounded spatial query. Thin
  // city/date combinations stay reachable by internal links but out of the
  // sitemap until enough real inventory exists to make them useful.
  const monthSlugs = upcomingMonthSlugs(new Date(), SEO_MONTHS_TO_PREGENERATE);
  const months = monthSlugs.map((slug) => ({ key: slug, ...monthRange(slug) }));
  const weekend = weekendWindow('Europe/Vienna');
  const windows = [
    { key: 'city', ...cityPageRange() },
    ...months,
    { key: 'heute', ...todayRange() },
    { key: 'kinder', ...cityPageRange(), kids: true },
    { key: 'wochenende', from: weekend.from, to: weekend.to },
  ];
  const manifest = await seoWindowManifest({ cities: SEO_CITIES, windows });
  const windowByCity = new Map(manifest.map((row) => [`${row.city_slug}:${row.window_key}`, row]));
  const windowPage = (city, key, path, changeFrequency, priority) => {
    const row = windowByCity.get(`${city.slug}:${key}`);
    if (!isIndexableEventCount(row?.event_count)) return null;
    return {
      url: `${base}${path}`,
      ...(row.last_modified ? { lastModified: new Date(row.last_modified) } : {}),
      changeFrequency,
      priority,
    };
  };
  const seoCities = SEO_CITIES
    .map((city) => windowPage(city, 'city', cityPath(city), 'daily', 0.85))
    .filter(Boolean);
  const seoWindows = SEO_CITIES.flatMap((city) => [
    windowPage(city, 'heute', cityIntentPath(city, 'heute'), 'hourly', 0.9),
    windowPage(city, 'kinder', cityIntentPath(city, 'kinder'), 'daily', 0.8),
    windowPage(city, 'wochenende', cityIntentPath(city, 'wochenende'), 'daily', 0.85),
    ...monthSlugs.map((slug) => windowPage(city, slug, cityMonthPath(city, slug), 'daily', 0.75)),
  ]).filter(Boolean);

  return [
    { url: base, changeFrequency: 'hourly', priority: 1 },
    { url: `${base}/events`, changeFrequency: 'weekly', priority: 0.8 },
    ...seoCities,
    ...seoWindows,
    ...cityIndexes,
    ...digests,
    ...events,
  ];
}
