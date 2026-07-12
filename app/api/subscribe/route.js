import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { addSubscriber } from '../../../lib/db.js';
import { limit } from '../../../lib/ratelimit.js';
import { notifyNewSubscriber, sendSubscriberConfirm } from '../../../lib/mail.js';
import { EVENT_CATS } from '../../../lib/icons.js';

export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Single source of truth for the category whitelist (shared with the map).
const EVENT_CATEGORIES = new Set(EVENT_CATS);
// The events map covers Austria + Bulgaria; a subscriber's locality centre must
// fall in that region, not just be a syntactically valid world coordinate — so
// a crafted (0,0) can't pollute targeting exports.
const AREA_BOUNDS = { latMin: 40, latMax: 50, lngMin: 8, lngMax: 30 };
const MESSAGES = {
  de: {
    limited: 'Zu viele Anfragen — bitte später wieder.',
    invalid: 'Bitte eine gültige E-Mail-Adresse eingeben.',
    invalidArea: 'Bitte einen gültigen Ort oder eine Postleitzahl auswählen.',
    invalidPreferences: 'Bitte wähle nur gültige Interessen aus.',
  },
  en: {
    limited: 'Too many requests — please try again later.',
    invalid: 'Please enter a valid email address.',
    invalidArea: 'Please choose a valid town or postcode.',
    invalidPreferences: 'Please choose valid interests.',
  },
  bg: {
    limited: 'Твърде много заявки — опитай отново по-късно.',
    invalid: 'Въведи валиден имейл адрес.',
    invalidArea: 'Избери валиден град или пощенски код.',
    invalidPreferences: 'Избери валидни интереси.',
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
  const areaLabel = String(body.areaLabel || '').trim();
  const areaLat = body.areaLat;
  const areaLng = body.areaLng;
  if (
    areaLabel.length < 2 || areaLabel.length > 120 ||
    !Number.isFinite(areaLat) || areaLat < AREA_BOUNDS.latMin || areaLat > AREA_BOUNDS.latMax ||
    !Number.isFinite(areaLng) || areaLng < AREA_BOUNDS.lngMin || areaLng > AREA_BOUNDS.lngMax
  ) {
    return NextResponse.json({ error: msg.invalidArea }, { status: 400 });
  }
  // radius is no longer a UI field — default it, but still validate if a client sends one.
  const radiusKm = body.radiusKm == null ? 20 : body.radiusKm;
  const categories = Array.isArray(body.categories) ? [...new Set(body.categories)] : [];
  if (
    !Number.isInteger(radiusKm) || radiusKm < 3 || radiusKm > 40 ||
    categories.some((cat) => !EVENT_CATEGORIES.has(cat))
  ) {
    return NextResponse.json({ error: msg.invalidPreferences }, { status: 400 });
  }
  const lang = ['de', 'en', 'bg'].includes(body.lang) ? body.lang : null;

  const { pending, token } = await addSubscriber(email, {
    source: 'newsletter_popup',
    lang,
    areaLabel,
    areaLat,
    areaLng,
    radiusKm,
    categories,
    token: randomUUID(),
  });

  // Double opt-in: nothing is "subscribed" until the address owner clicks the
  // confirm link, so we can't leak whether the email already existed.
  if (pending && token) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events';
    const confirmUrl = `${base}/api/subscribe/confirm?token=${encodeURIComponent(token)}&lang=${lang || 'en'}`;
    await sendSubscriberConfirm(email, { lang, confirmUrl });
    await notifyNewSubscriber(email, { lang, source: 'newsletter_popup' });
  }
  return NextResponse.json({ ok: true, pending });
}
