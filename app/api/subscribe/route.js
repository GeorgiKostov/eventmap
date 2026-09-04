import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { addSubscriber } from '../../../lib/db.js';
import { limit, hashIp } from '../../../lib/ratelimit.js';
import { notifyNewSubscriber, sendSubscriberConfirm } from '../../../lib/mail.js';
import { EVENT_CATS } from '../../../lib/icons.js';
import { NL_CONSENT_VERSION } from '../../../lib/i18n.js';
import { resolveNewsletterPreference } from '../../../lib/newsletter-preference.js';

export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Single source of truth for the category whitelist (shared with the map).
const EVENT_CATEGORIES = new Set(EVENT_CATS);
// Where the signup happened. A CLOSED enum, not a free string: `source` is an
// anonymous write that lands in a column we read when judging the four-weekend
// test ("did the SEO pages actually convert?"), so an open field would be both
// unmoderatable and useless for grouping. Anything unrecognised falls back to
// the map popup rather than being rejected — a mis-set source must never cost
// us a real subscriber.
const SIGNUP_SOURCES = new Set(['newsletter_popup', 'weekend_page', 'event_page']);
const MESSAGES = {
  de: {
    limited: 'Zu viele Anfragen — bitte später wieder.',
    invalid: 'Bitte eine gültige E-Mail-Adresse eingeben.',
    invalidEdition: 'Bitte wähle eine verfügbare Newsletter-Ausgabe.',
    invalidWaitlist: 'Bitte wähle einen Ort aus, damit wir dich zum Start benachrichtigen können.',
    invalidPreferences: 'Bitte wähle nur gültige Interessen aus.',
    mailDown: 'Anmeldung momentan nicht möglich — bitte später erneut versuchen.',
  },
  en: {
    limited: 'Too many requests — please try again later.',
    invalid: 'Please enter a valid email address.',
    invalidEdition: 'Please choose an available newsletter edition.',
    invalidWaitlist: 'Please choose a town so we can notify you when it launches.',
    invalidPreferences: 'Please choose valid interests.',
    mailDown: 'Sign-up isn’t available right now — please try again later.',
  },
  bg: {
    limited: 'Твърде много заявки — опитай отново по-късно.',
    invalid: 'Въведи валиден имейл адрес.',
    invalidEdition: 'Избери налично издание на бюлетина.',
    invalidWaitlist: 'Избери град, за да те уведомим, когато стартира.',
    invalidPreferences: 'Избери валидни интереси.',
    mailDown: 'Записването не е възможно в момента — опитай отново по-късно.',
  },
};

export async function POST(req) {
  const msg = MESSAGES[req.headers.get('x-okolo-lang')] || MESSAGES.en;
  const rl = await limit(req, 'subscribe', { perHour: 5, perDay: 15 });
  if (rl) return NextResponse.json({ error: msg.limited }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: msg.invalid }, { status: 400 });
  }
  const preference = resolveNewsletterPreference(body);
  if (preference.error === 'unsupported_edition') {
    return NextResponse.json({ error: msg.invalidEdition, code: 'unsupported_edition' }, { status: 400 });
  }
  if (preference.error) {
    return NextResponse.json({ error: msg.invalidWaitlist, code: 'invalid_waitlist_area' }, { status: 400 });
  }
  const { kind, areaLabel, areaLat, areaLng, areaCountry } = preference;
  const waitlist = kind === 'waitlist';
  // radius is no longer a UI field — default it, but still validate if a client sends one.
  const radiusKm = body.radiusKm == null ? 20 : body.radiusKm;
  const categories = Array.isArray(body.categories) ? [...new Set(body.categories)] : [];
  if (
    !Number.isInteger(radiusKm) || radiusKm < 3 || radiusKm > 40 ||
    categories.some((cat) => !EVENT_CATEGORIES.has(cat))
  ) {
    return NextResponse.json({ error: msg.invalidPreferences }, { status: 400 });
  }
  // The subscriber's language decides every mail we ever send them (confirm +
  // newsletter fallbacks). The UI language they signed up in is their choice and
  // wins; an omitted language falls back to German because the current live
  // edition is Linz.
  const lang = ['de', 'en', 'bg'].includes(body.lang)
    ? body.lang
    : 'de';

  const source = SIGNUP_SOURCES.has(body.source) ? body.source : 'newsletter_popup';
  const { pending, token } = await addSubscriber(email, {
    source,
    lang,
    areaLabel,
    areaLat,
    areaLng,
    areaCountry,
    subscriptionKind: kind,
    channelSlug: preference.edition?.slug || null,
    radiusKm,
    categories,
    token: randomUUID(),
    // Proof of consent (Art. 7(1) GDPR): the wording version is stamped
    // server-side (client + server deploy together, so this IS what was shown),
    // and the IP is stored only as the rate limiter's salted hash, never raw.
    consentVersion: NL_CONSENT_VERSION,
    consentIpHash: hashIp(req),
  });

  // Double opt-in: nothing is "subscribed" until the address owner clicks the
  // confirm link, so we can't leak whether the email already existed.
  if (pending && token) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events';
    const confirmUrl = `${base}/api/subscribe/confirm?token=${encodeURIComponent(token)}&lang=${lang || 'en'}`;
    const delivered = await sendSubscriberConfirm(email, {
      lang,
      confirmUrl,
      waitlist,
    });

    // If the mail did NOT go out, do not tell them to check their inbox. The UI
    // reads `pending` and says "we've sent you an email — click the link", so a
    // silent false here leaves a real person waiting for a mail that does not
    // exist, and their signup can never be confirmed. An honest 503 is worse for
    // one signup and far better for trust — and it's the difference between a
    // misconfiguration we notice and one we don't.
    if (!delivered) {
      console.error('[subscribe] no mail provider accepted the confirmation — set RESEND_API_KEY or SMTP_USER/SMTP_PASS');
      return NextResponse.json({ error: msg.mailDown }, { status: 503 });
    }
    await notifyNewSubscriber(email, { lang, source, areaLabel, kind });
  }
  return NextResponse.json({ ok: true, pending, kind });
}
