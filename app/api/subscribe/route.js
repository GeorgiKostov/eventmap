import { NextResponse } from 'next/server';
import { addSubscriber } from '../../../lib/db.js';
import { limit } from '../../../lib/ratelimit.js';
import { notifyNewSubscriber } from '../../../lib/mail.js';

export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGES = {
  de: { limited: 'Zu viele Anfragen — bitte später wieder.', invalid: 'Bitte eine gültige E-Mail-Adresse eingeben.' },
  en: { limited: 'Too many requests — please try again later.', invalid: 'Please enter a valid email address.' },
  bg: { limited: 'Твърде много заявки — опитай отново по-късно.', invalid: 'Въведи валиден имейл адрес.' },
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
  const { inserted } = await addSubscriber(email, { source: 'newsletter_popup', lang: body.lang || null });
  if (inserted) await notifyNewSubscriber(email, { lang: body.lang || null, source: 'newsletter_popup' });
  return NextResponse.json({ ok: true, inserted });
}
