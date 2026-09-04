import { newsletterEdition, newsletterEditionForPoint } from './newsletter-market.js';
import { newsletterWaitlistAreaSupported } from './newsletter-area.js';

// Validate the one choice shared by signup and the tokenized preferences page.
// Live editions are canonical server data; waitlist locations must be resolved
// structured points, not unchecked free text.
export function resolveNewsletterPreference(body = {}) {
  const requestedEdition = String(body.edition || '');
  const waitlist = requestedEdition === 'waitlist';
  const edition = waitlist ? null : newsletterEdition(requestedEdition);
  if (!waitlist && !edition) return { error: 'unsupported_edition' };

  const areaLabel = edition?.label || String(body.areaLabel || '').trim();
  const areaLat = edition?.lat ?? body.areaLat;
  const areaLng = edition?.lng ?? body.areaLng;
  const areaCountry = edition?.country || String(body.areaCountry || '').toUpperCase();
  if (waitlist && (
    areaLabel.length < 2 || areaLabel.length > 120 ||
    !newsletterWaitlistAreaSupported({ country: areaCountry, lat: areaLat, lng: areaLng })
  )) return { error: 'invalid_waitlist_area' };
  const availableEdition = waitlist ? newsletterEditionForPoint(areaLat, areaLng) : null;
  if (availableEdition) return { error: 'edition_available', edition: availableEdition };

  return {
    kind: waitlist ? 'waitlist' : 'edition',
    edition,
    areaLabel,
    areaLat,
    areaLng,
    areaCountry,
  };
}
