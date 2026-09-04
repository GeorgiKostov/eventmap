import tzlookup from 'tz-lookup';
import { newsletterCountrySupported, newsletterWaitlistCountrySupported } from './newsletter-market.js';

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

// Launch notifications may be requested anywhere the current map can resolve a
// locality. Unlike weekly delivery, this does not claim that a newsletter is
// live there; it records only a coarse selected place for a one-time launch
// notice. Coordinates still have to be finite and globally plausible.
export function newsletterWaitlistAreaSupported({ country, lat, lng } = {}) {
  return newsletterWaitlistCountrySupported(country)
    && Number.isFinite(lat)
    && lat > -90 && lat < 90
    && Number.isFinite(lng)
    && lng > -180 && lng < 180;
}
