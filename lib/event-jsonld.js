import { validDateOf, validTimeOf } from './event-time.js';
import { publicUrl } from './public-url.js';
import { eventSummary } from './event-summary.js';

const COUNTRY_TZ = { AT: 'Europe/Vienna', BG: 'Europe/Sofia', DE: 'Europe/Berlin' };

function offsetAt(local, timeZone) {
  const [date, time = '00:00'] = local.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const zone = new Intl.DateTimeFormat('en', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
  }).formatToParts(utcGuess).find((part) => part.type === 'timeZoneName')?.value;
  const match = zone?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) return '+00:00';
  return `${match[1]}${match[2]}:${match[3]}`;
}

export function isoLocalEventTime(local, timeZone = 'Europe/Vienna') {
  return `${local}:00${offsetAt(local, timeZone)}`;
}

export function eventDescription(ev) {
  return eventSummary(ev);
}

export function eventJsonLd(ev, id = ev.id) {
  if (ev.kind === 'place') return null;
  const startDate = validDateOf(ev.starts_at);
  // A reliable start date is the minimum Event claim. Malformed legacy rows
  // remain readable as ordinary pages, but never emit invalid structured data.
  if (!startDate) return null;
  const endDate = validDateOf(ev.ends_at);
  const timeZone = ev.tz || COUNTRY_TZ[ev.country] || 'UTC';
  const eventUrl = publicUrl(`event/${id}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    description: eventDescription(ev),
    url: eventUrl,
    image: [`${eventUrl}/opengraph-image`],
    // A bare Date is honest when the publisher supplied no time. Unknown end
    // dates remain absent; inventing one just to silence a warning is worse.
    startDate: ev.all_day || !validTimeOf(ev.starts_at)
      ? startDate
      : isoLocalEventTime(ev.starts_at, timeZone),
    endDate: endDate
      ? (ev.all_day || !validTimeOf(ev.ends_at)
          ? endDate
          : isoLocalEventTime(ev.ends_at, timeZone))
      : undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: ev.venue || ev.town || undefined,
      address: {
        '@type': 'PostalAddress',
        streetAddress: ev.address || undefined,
        addressLocality: ev.town || undefined,
        addressCountry: ev.country || undefined,
      },
      geo: { '@type': 'GeoCoordinates', latitude: ev.lat, longitude: ev.lng },
    },
    isAccessibleForFree: ev.is_free === 1 ? true : ev.is_free === 0 ? false : undefined,
    offers: ev.is_free === 1
      ? { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }
      : undefined,
    typicalAgeRange: ev.age_min != null ? `${ev.age_min}-${ev.age_max ?? ''}` : undefined,
    sameAs: ev.source_url || undefined,
  };
}
