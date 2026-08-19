const VIENNA_TZ = 'Europe/Vienna';

// Explicit rollout list. These are the Austrian cities with enough current
// coverage to support useful landing pages; the search gazetteer is much wider
// and must not silently become an SEO-page registry.
export const SEO_CITIES = [
  { slug: 'linz', label: 'Linz', lat: 48.3069, lng: 14.2858, radiusKm: 40 },
  { slug: 'wien', label: 'Wien', lat: 48.2082, lng: 16.3738, radiusKm: 40, aliases: ['vienna'] },
  { slug: 'graz', label: 'Graz', lat: 47.0707, lng: 15.4395, radiusKm: 30 },
  { slug: 'salzburg', label: 'Salzburg', lat: 47.8095, lng: 13.0550, radiusKm: 30 },
  { slug: 'innsbruck', label: 'Innsbruck', lat: 47.2692, lng: 11.4041, radiusKm: 30 },
  { slug: 'klagenfurt', label: 'Klagenfurt', lat: 46.6247, lng: 14.3053, radiusKm: 30 },
  { slug: 'villach', label: 'Villach', lat: 46.6103, lng: 13.8558, radiusKm: 30 },
  { slug: 'wels', label: 'Wels', lat: 48.1575, lng: 14.0289, radiusKm: 30 },
  { slug: 'sankt-poelten', label: 'Sankt Pölten', lat: 48.2047, lng: 15.6256, radiusKm: 30 },
];

export const SEO_MONTHS_TO_PREGENERATE = 6;
export const SEO_MONTHS_SUPPORTED = 12;
export const SEO_MIN_INDEXABLE_EVENTS = 5;

export function resolveSeoCity(slug) {
  const value = String(slug || '');
  for (const city of SEO_CITIES) {
    if (city.slug === value) return { city, canonical: true };
    if (city.aliases?.includes(value)) return { city, canonical: false };
  }
  return null;
}

export function getSeoCity(slug) {
  return resolveSeoCity(slug)?.city || null;
}

export function seoCityForPoint(lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  let nearest = null;
  let nearestKm = Infinity;
  for (const city of SEO_CITIES) {
    const dLat = ((Number(lat) - city.lat) * Math.PI) / 180;
    const dLng = ((Number(lng) - city.lng) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos((city.lat * Math.PI) / 180) * Math.cos((Number(lat) * Math.PI) / 180)
      * Math.sin(dLng / 2) ** 2;
    const distanceKm = 2 * 6371 * Math.asin(Math.sqrt(a));
    if (distanceKm <= city.radiusKm && distanceKm < nearestKm) {
      nearest = city;
      nearestKm = distanceKm;
    }
  }
  return nearest;
}

function dateInTimeZone(now, timeZone = VIENNA_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shiftMonth(monthSlug, offset) {
  const [year, month] = monthSlug.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function currentMonthSlug(now = new Date()) {
  return dateInTimeZone(now).slice(0, 7);
}

export function upcomingMonthSlugs(now = new Date(), count = SEO_MONTHS_TO_PREGENERATE) {
  const first = currentMonthSlug(now);
  return Array.from({ length: Math.max(0, count) }, (_, i) => shiftMonth(first, i));
}

export function monthRange(monthSlug) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(monthSlug || ''));
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 2099) return null;
  const month = Number(match[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    slug: monthSlug,
    from: `${monthSlug}-01`,
    to: `${monthSlug}-${String(last).padStart(2, '0')}`,
  };
}

export function isSupportedMonth(monthSlug, now = new Date()) {
  if (!monthRange(monthSlug)) return false;
  return upcomingMonthSlugs(now, SEO_MONTHS_SUPPORTED).includes(monthSlug);
}

export function cityPageRange(now = new Date()) {
  const from = dateInTimeZone(now);
  const lastMonth = shiftMonth(from.slice(0, 7), 2);
  return { from, to: monthRange(lastMonth).to };
}

export function todayRange(now = new Date()) {
  const today = dateInTimeZone(now);
  return { from: today, to: today };
}

export function monthLabel(monthSlug) {
  const range = monthRange(monthSlug);
  if (!range) return null;
  return new Intl.DateTimeFormat('de-AT', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${range.from}T12:00:00Z`));
}

export function cityPath(city) {
  return `/events/${city.slug}`;
}

export function cityMonthPath(city, monthSlug) {
  const [year, month] = monthSlug.split('-');
  return `${cityPath(city)}/${year}/${month}`;
}

export function cityIntentPath(city, intent) {
  return `${cityPath(city)}/${intent}`;
}

export function isIndexableEventCount(count) {
  return Number(count) >= SEO_MIN_INDEXABLE_EVENTS;
}
