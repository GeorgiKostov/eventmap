import { NextResponse } from 'next/server';
import { bearerTokenValid, isAdmin } from '../../../../lib/admin-auth.js';
import { confirmedSubscribers, metaGet, metaSet } from '../../../../lib/db.js';
import { mailConfigured, sendNewsletterPreferencesRequest } from '../../../../lib/mail.js';
import { isSameOriginMutation } from '../../../../lib/request-security.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://www.okolo.events').replace(/\/$/, '');
const CAMPAIGN = 'newsletter-preferences-v1';

export async function POST(req) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  }
  if (!isAdmin(req) && !bearerTokenValid(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!mailConfigured()) {
    return NextResponse.json({ error: 'No mail provider — nothing was sent.' }, { status: 503 });
  }

  const subscribers = (await confirmedSubscribers()).filter((subscriber) => subscriber.token);
  const doneKey = `sent:${CAMPAIGN}:to`;
  const done = new Set(JSON.parse((await metaGet(doneKey)) || '[]'));
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const subscriber of subscribers) {
    if (done.has(String(subscriber.id))) {
      skipped++;
      continue;
    }
    const lang = subscriber.lang || 'en';
    const preferencesUrl = `${BASE}/newsletter/preferences?token=${encodeURIComponent(subscriber.token)}&lang=${encodeURIComponent(lang)}`;
    const unsubscribeUrl = `${BASE}/api/subscribe/unsubscribe?token=${encodeURIComponent(subscriber.token)}&lang=${encodeURIComponent(lang)}`;
    try {
      const accepted = await sendNewsletterPreferencesRequest({
        to: subscriber.email,
        lang,
        preferencesUrl,
        unsubscribeUrl,
        idempotencyKey: `${CAMPAIGN}-${subscriber.id}`,
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
      console.error('[newsletter-preferences] send failed:', subscriber.id, error?.message || error);
    }
  }

  if (failed === 0 && done.size >= subscribers.length) {
    await metaSet(`sent:${CAMPAIGN}`, new Date().toISOString());
  }
  return NextResponse.json({ sent, skipped, failed, audience: subscribers.length });
}
