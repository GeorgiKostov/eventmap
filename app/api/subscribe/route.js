import { NextResponse } from 'next/server';
import { addSubscriber } from '../../../lib/db.js';
import { limit } from '../../../lib/ratelimit.js';
import { notifyNewSubscriber } from '../../../lib/mail.js';

export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_CATEGORIES = new Set(['family', 'festival', 'market', 'music', 'culture', 'food', 'sport', 'workshop']);
const MESSAGES = {
  de: {
    limited: 'Zu viele Anfragen — bitte später wieder.',
    invalid: 'Bitte eine gültige E-Mail-Adresse eingeben.',
    invalidArea: 'Bitte einen gültigen Ort oder eine Postleitzahl auswählen.',
    invalidPreferences: 'Bitte wähle höchstens drei gültige Interessen aus.',
  },
  en: {
    limited: 'Too many requests — please try again later.',
    invalid: 'Please enter a valid email address.',
    invalidArea: 'Please choose a valid town or postcode.',
    invalidPreferences: 'Please choose no more than three valid interests.',
  },
  bg: {
    limited: 'Твърде много заявки — опитай отново по-късно.',
    invalid: 'Въведи валиден имейл адрес.',
    invalidArea: 'Избери валиден град или пощенски код.',
    invalidPreferences: 'Избери най-много три валидни интереса.',
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
    !Number.isFinite(areaLat) || areaLat < -90 || areaLat > 90 ||
    !Number.isFinite(areaLng) || areaLng < -180 || areaLng > 180
  ) {
    return NextResponse.json({ error: msg.invalidArea }, { status: 400 });
  }
  const radiusKm = body.radiusKm;
  const categories = Array.isArray(body.categories) ? [...new Set(body.categories)] : [];
  if (
    !Number.isInteger(radiusKm) || radiusKm < 3 || radiusKm > 40 ||
    categories.length > 3 || categories.some((cat) => !EVENT_CATEGORIES.has(cat))
  ) {
    return NextResponse.json({ error: msg.invalidPreferences }, { status: 400 });
  }
  const lang = ['de', 'en', 'bg'].includes(body.lang) ? body.lang : null;
  const { inserted } = await addSubscriber(email, {
    source: 'newsletter_popup',
    lang,
    areaLabel,
    areaLat,
    areaLng,
    radiusKm,
    categories,
  });
  if (inserted) await notifyNewSubscriber(email, { lang, source: 'newsletter_popup' });
  return NextResponse.json({ ok: true, inserted });
}
