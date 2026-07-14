import { NextResponse } from 'next/server';
import { getChannel, CHANNELS, channelForPoint } from '../../../../lib/city-channels.js';
import { loadOrBuildDigest, saveDigest, applyDrop, renderNewsletter, renderCaption } from '../../../../lib/digest.js';
import { confirmedSubscribers, metaGet, metaSet } from '../../../../lib/db.js';
import { sendNewsletter, mailConfigured } from '../../../../lib/mail.js';
import { isAdmin } from '../../../../lib/admin-auth.js';

// The Thursday flow's engine (docs/ops/weekly-automation.md). One route:
//   GET                → the frozen weekly snapshot + caption + email preview + audience size
//   POST regenerate    → rebuild the picks (new AI copy), overwrite the snapshot
//   POST drop          → remove a bad pick and re-freeze (George's editorial veto)
//   POST send          → mail the digest to this city's confirmed subscribers
//
// Sending is DELIBERATELY a manual button, not a cron: an auto-sent newsletter
// nobody looked at is how you mail 500 parents a wrong event. The cron only
// prepares (see .github/workflows/weekly-digest.yml).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');
const unsubUrl = (sub) => `${BASE}/api/subscribe/unsubscribe?token=${sub.token}&lang=${sub.lang || 'de'}`;
const sentKey = (slug, friday) => `sent:digest:${slug}:${friday}`;

// A subscriber belongs to the city whose catchment contains the locality they
// chose at signup. No area on the row (legacy signups) → no city → not mailed:
// a digest for the wrong city is worse than no digest.
function audienceFor(channel, subs) {
  return subs.filter((s) => {
    if (s.area_lat == null || s.area_lng == null) return false;
    return channelForPoint(Number(s.area_lat), Number(s.area_lng))?.slug === channel.slug;
  });
}

async function snapshot(channel, { force = false } = {}) {
  const digest = await loadOrBuildDigest(channel, { force });
  const subs = await confirmedSubscribers();
  const audience = audienceFor(channel, subs);
  const sentAt = await metaGet(sentKey(channel.slug, digest.window.friday));
  const preview = renderNewsletter(digest, {
    unsubscribeUrl: `${BASE}/api/subscribe/unsubscribe?token=PREVIEW`,
  });
  return {
    digest,
    caption: renderCaption(digest),
    subject: preview.subject,
    html: preview.html,
    cards: Array.from({ length: digest.items.length + 1 }, (_, i) => `/api/social/card?channel=${channel.slug}&slide=${i}`),
    audience: audience.length,
    sentAt,
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const channel = getChannel(searchParams.get('channel') || 'linz');
  if (!channel) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });
  return NextResponse.json({
    channels: CHANNELS.map((c) => ({ slug: c.slug, label: c.label, handle: c.handle, lang: c.lang })),
    ...(await snapshot(channel)),
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const channel = getChannel(body.channel || 'linz');
  if (!channel) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

  if (body.action === 'regenerate') {
    return NextResponse.json(await snapshot(channel, { force: true }));
  }

  if (body.action === 'drop') {
    const digest = await loadOrBuildDigest(channel);
    await saveDigest(applyDrop(digest, body.id));
    return NextResponse.json(await snapshot(channel));
  }

  if (body.action === 'send') {
    const digest = await loadOrBuildDigest(channel);
    if (!digest.items.length) return NextResponse.json({ error: 'nothing to send' }, { status: 400 });

    // Idempotence ledger: a double-click, a retry or a re-deploy must never
    // mail the list twice for the same weekend. `force` is the deliberate override.
    const key = sentKey(channel.slug, digest.window.friday);
    if (!body.force && (await metaGet(key))) {
      return NextResponse.json({ error: 'already sent for this weekend', sentAt: await metaGet(key) }, { status: 409 });
    }

    // sendNewsletter() returns false when no provider is configured. Reporting
    // "sent to 40 subscribers" when nothing left the building is the worst
    // possible lie for this button — fail loudly instead.
    if (!mailConfigured()) {
      return NextResponse.json({ error: 'No mail provider — nothing was sent. Set RESEND_API_KEY or SMTP_USER/SMTP_PASS.' }, { status: 503 });
    }

    const audience = audienceFor(channel, await confirmedSubscribers());
    if (body.test) {
      const to = process.env.NOTIFY_TO || process.env.SMTP_USER || process.env.MAIL_FROM;
      const url = `${BASE}/api/subscribe/unsubscribe?token=TEST`;
      const mail = renderNewsletter(digest, { unsubscribeUrl: url });
      const ok = await sendNewsletter({ to, ...mail, unsubscribeUrl: url });
      return NextResponse.json({ test: true, to, sent: ok ? 1 : 0, audience: audience.length });
    }

    // Per-recipient ledger, persisted after EACH success. A 60s timeout or a
    // crash mid-loop must never let a retry re-mail someone who already got it,
    // and a partial failure (60/100 sent) must resend only the 40 that failed —
    // not the whole list. The set survives across requests in `meta`.
    const doneKey = `${key}:to`;
    // force = a deliberate full resend (e.g. a corrected pick): wipe the
    // per-recipient ledger so everyone is mailed again. Without force, the set is
    // honoured so retries only fill the gaps.
    if (body.force) await metaSet(doneKey, '[]');
    const done = new Set(JSON.parse((body.force ? '[]' : await metaGet(doneKey)) || '[]'));

    let sent = 0;
    let skipped = 0;
    const failed = [];
    for (const sub of audience) {
      if (done.has(String(sub.id))) { skipped++; continue; }
      const url = unsubUrl(sub);
      const mail = renderNewsletter(digest, { unsubscribeUrl: url });
      try {
        if (await sendNewsletter({ to: sub.email, ...mail, unsubscribeUrl: url })) {
          sent++;
          done.add(String(sub.id));
          await metaSet(doneKey, JSON.stringify([...done])); // durable before the next send
        } else {
          failed.push(sub.email);
        }
      } catch (err) {
        failed.push(sub.email);
        console.error('[digest] send failed:', sub.email, err?.message);
      }
    }
    // Mark the weekend "done" only when everyone in the audience has been sent to
    // (nothing left to retry). A partial run leaves the 409 guard open so a plain
    // resend finishes the remainder without re-mailing the done recipients.
    if (failed.length === 0 && audience.length > 0) await metaSet(key, new Date().toISOString());
    return NextResponse.json({ sent, skipped, failed: failed.length, audience: audience.length });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
