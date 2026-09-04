import { getChannel, haversineKm } from './city-channels.js';

// A channel in city-channels.js is only a prepared publishing configuration; it
// is NOT a promise that a weekly email is running there. Keep the live editions
// explicit so signup, preferences and delivery all answer the same question.
// Linz is the sole validation-phase edition. Adding a slug here is a launch
// decision and must happen together with its real Thursday send path.
export const NEWSLETTER_EDITION_SLUGS = ['linz'];
export const NEWSLETTER_EDITIONS = NEWSLETTER_EDITION_SLUGS
  .map(getChannel)
  .filter(Boolean);

export function newsletterEdition(slug) {
  return NEWSLETTER_EDITIONS.find((channel) => channel.slug === slug) || null;
}

export function newsletterEditionForPoint(lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const channel of NEWSLETTER_EDITIONS) {
    const distance = haversineKm(Number(lat), Number(lng), channel.lat, channel.lng);
    if (distance <= channel.radiusKm && distance < bestDistance) {
      best = channel;
      bestDistance = distance;
    }
  }
  return best;
}

// Waitlist locations are structured geocoder/gazetteer results, never arbitrary
// audience prose. These are the countries Okolo currently serves on the map and
// can therefore resolve honestly in its existing location picker.
export const NEWSLETTER_WAITLIST_COUNTRIES = ['AT', 'BG', 'DE'];

export function newsletterWaitlistCountrySupported(country) {
  return NEWSLETTER_WAITLIST_COUNTRIES.includes(String(country || '').toUpperCase());
}

// Retained for delivery guards and older callers: the only live edition is in
// Austria. Signup availability itself is now edition-based, not country-based.

export const NEWSLETTER_COUNTRY = 'AT';

export function newsletterCountrySupported(country) {
  return String(country || '').toUpperCase() === NEWSLETTER_COUNTRY;
}
