import { NextResponse } from 'next/server';
import { updateSubscriberPreferences } from '../../../../lib/db.js';
import { resolveNewsletterPreference } from '../../../../lib/newsletter-preference.js';
import { NL_CONSENT_VERSION } from '../../../../lib/i18n.js';
import { hashIp, limit } from '../../../../lib/ratelimit.js';
import { isSameOriginMutation } from '../../../../lib/request-security.js';
import { captureServer } from '../../../../lib/analytics-server.js';

export const dynamic = 'force-dynamic';

const MESSAGES = {
  de: { invalid: 'Bitte wähle eine gültige Ausgabe oder Stadt.', editionAvailable: 'Für diesen Ort gibt es bereits einen Newsletter — bitte wähle die passende Ausgabe.', expired: 'Dieser Link ist ungültig oder nicht mehr aktiv.', limited: 'Zu viele Anfragen — bitte später wieder.' },
  en: { invalid: 'Please choose a valid edition or city.', editionAvailable: 'A newsletter is already available for this town — please choose that edition.', expired: 'This link is invalid or no longer active.', limited: 'Too many requests — please try again later.' },
  bg: { invalid: 'Избери валидно издание или град.', editionAvailable: 'За този град вече има бюлетин — избери съответното издание.', expired: 'Този линк е невалиден или вече не е активен.', limited: 'Твърде много заявки — опитай отново по-късно.' },
};

export async function POST(req) {
  const msg = MESSAGES[req.headers.get('x-okolo-lang')] || MESSAGES.en;
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  }
  const rl = await limit(req, 'newsletter_preferences', { perHour: 20, perDay: 50 });
  if (rl) return NextResponse.json({ error: msg.limited }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || '');
  const preference = resolveNewsletterPreference(body);
  if (preference.error === 'edition_available') {
    return NextResponse.json({ error: msg.editionAvailable, code: 'edition_available' }, { status: 400 });
  }
  if (!token || preference.error) {
    return NextResponse.json({ error: msg.invalid }, { status: 400 });
  }
  const subscriberId = await updateSubscriberPreferences(token, {
    areaLabel: preference.areaLabel,
    areaLat: preference.areaLat,
    areaLng: preference.areaLng,
    areaCountry: preference.areaCountry,
    subscriptionKind: preference.kind,
    channelSlug: preference.edition?.slug || null,
    consentVersion: NL_CONSENT_VERSION,
    consentIpHash: hashIp(req),
  });
  if (!subscriberId) return NextResponse.json({ error: msg.expired }, { status: 404 });

  await captureServer('newsletter_preference_saved', {
    distinctId: `subscriber:${subscriberId}`,
    properties: {
      signup_kind: preference.kind,
      edition: preference.edition?.slug || null,
      area: preference.areaLabel,
    },
  });
  return NextResponse.json({ ok: true, kind: preference.kind });
}
