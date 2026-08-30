import tzlookup from 'tz-lookup';
import { newsletterCountrySupported } from './newsletter-market.js';

// The country code comes from the selected gazetteer/geocoder result, but the
// API also verifies the coordinates offline. A rectangle alone is insufficient:
// Austria's bounding box contains parts of Germany and several other neighbours.
const AUSTRIA_BOUNDS = { latMin: 46.3, latMax: 49.1, lngMin: 9.4, lngMax: 17.3 };

export function newsletterAreaSupported({ country, lat, lng } = {}) {
  if (
    !newsletterCountrySupported(country)
    || !Number.isFinite(lat)
    || lat <= AUSTRIA_BOUNDS.latMin
    || lat >= AUSTRIA_BOUNDS.latMax
    || !Number.isFinite(lng)
    || lng <= AUSTRIA_BOUNDS.lngMin
    || lng >= AUSTRIA_BOUNDS.lngMax
  ) return false;

  try {
    return tzlookup(lat, lng) === 'Europe/Vienna';
  } catch {
    return false;
  }
}
