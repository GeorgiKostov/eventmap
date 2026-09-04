import { NextResponse } from 'next/server';
import { bearerTokenValid, isAdmin } from '../../../../lib/admin-auth.js';
import { confirmedSubscribers, metaGet, metaSet } from '../../../../lib/db.js';
import { mailConfigured, sendNewsletterLaunchNotice } from '../../../../lib/mail.js';
import { newsletterEdition, newsletterEditionForPoint } from '../../../../lib/newsletter-market.js';
import { isSameOriginMutation } from '../../../../lib/request-security.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.okolo.events').replace(/\/$/, '');

export async function POST(req) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  }
  if (!isAdmin(req) && !bearerTokenValid(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const edition = newsletterEdition(String(body.channel || ''));
  if (!edition) return NextResponse.json({ error: 'unknown or inactive newsletter edition' }, { status: 400 });
  if (!mailConfigured()) return NextResponse.json({ error: 'No mail provider — nothing was sent.' }, { status: 503 });

  const audience = (await confirmedSubscribers()).filter((subscriber) =>
    subscriber.token
    && subscriber.subscription_kind === 'waitlist'
    && newsletterEditionForPoint(Number(subscriber.area_lat), Number(subscriber.area_lng))?.slug === edition.slug,
  );
  const campaign = `newsletter-launch-${edition.slug}-v1`;
  const doneKey = `sent:${campaign}:to`;
  const done = new Set(JSON.parse((await metaGet(doneKey)) || '[]'));
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const subscriber of audience) {
    if (done.has(String(subscriber.id))) {
      skipped++;
      continue;
    }
    const lang = subscriber.lang || edition.lang || 'en';
    const preferencesUrl = `${BASE}/newsletter/preferences?token=${encodeURIComponent(subscriber.token)}&lang=${encodeURIComponent(lang)}`;
    const unsubscribeUrl = `${BASE}/api/subscribe/unsubscribe?token=${encodeURIComponent(subscriber.token)}&lang=${encodeURIComponent(lang)}`;
    try {
      const accepted = await sendNewsletterLaunchNotice({
        to: subscriber.email,
        lang,
        city: edition.label,
        preferencesUrl,
        unsubscribeUrl,
        idempotencyKey: `${campaign}-${subscriber.id}`,
      });
      if (!accepted) {
        failed++;
        continue;
      }
      sent++;
      done.add(String(subscriber.id));
      await metaSet(doneKey, JSON.stringify([...done]));
    } catch (error) {
      failed++;
      console.error('[newsletter-launch] send failed:', edition.slug, subscriber.id, error?.message || error);
    }
  }

  if (failed === 0) await metaSet(`sent:${campaign}`, new Date().toISOString());
  return NextResponse.json({ channel: edition.slug, sent, skipped, failed, audience: audience.length });
}
