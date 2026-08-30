// Newsletter market scope is deliberately narrower than map coverage. Bulgaria
// and Germany remain browsable, but only Austrian localities may create or
// receive a newsletter subscription during the Linz validation phase.

export const NEWSLETTER_COUNTRY = 'AT';

export function newsletterCountrySupported(country) {
  return String(country || '').toUpperCase() === NEWSLETTER_COUNTRY;
}
