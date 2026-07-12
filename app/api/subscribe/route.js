import { NextResponse } from 'next/server';
import { addSubscriber } from '../../../lib/db.js';
import { limit } from '../../../lib/ratelimit.js';
import { notifyNewSubscriber } from '../../../lib/mail.js';

export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req) {
  const rl = await limit(req, 'subscribe', { perHour: 5, perDay: 15 });
  if (rl) return NextResponse.json({ error: 'Zu viele Anfragen — bitte später wieder.' }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, { status: 400 });
  }
  const { inserted } = await addSubscriber(email, { source: 'newsletter_popup', lang: body.lang || null });
  if (inserted) await notifyNewSubscriber(email, { lang: body.lang || null, source: 'newsletter_popup' });
  return NextResponse.json({ ok: true, inserted });
}
