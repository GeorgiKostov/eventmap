import { NextResponse } from 'next/server';
import { getChannel, CHANNELS, channelForPoint } from '../../../../lib/city-channels.js';
import { loadOrBuildDigest, saveDigest, renderNewsletter, renderCaption } from '../../../../lib/digest.js';
import { confirmedSubscribers, metaGet, metaSet } from '../../../../lib/db.js';
import { sendNewsletter } from '../../../../lib/mail.js';
import { adminOk } from '../../../../lib/admin-auth.js';

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
  if (!adminOk(searchParams.get('token'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const channel = getChannel(searchParams.get('channel') || 'linz');
  if (!channel) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });
  return NextResponse.json({
    channels: CHANNELS.map((c) => ({ slug: c.slug, label: c.label, handle: c.handle, lang: c.lang })),
    ...(await snapshot(channel)),
  });
}

export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  if (!adminOk(body.token || searchParams.get('token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const channel = getChannel(body.channel || 'linz');
  if (!channel) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

  if (body.action === 'regenerate') {
    return NextResponse.json(await snapshot(channel, { force: true }));
  }

  if (body.action === 'drop') {
    const digest = await loadOrBuildDigest(channel);
    digest.items = digest.items.filter((it) => it.id !== String(body.id));
    await saveDigest(digest);
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

    // sendNewsletter() is a no-op returning false when SMTP isn't configured.
    // Reporting "sent to 40 subscribers" when nothing left the building is the
    // worst possible lie for this button — fail loudly instead.
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: 'SMTP not configured — nothing was sent. Set SMTP_USER / SMTP_PASS.' }, { status: 503 });
    }

    const audience = audienceFor(channel, await confirmedSubscribers());
    if (body.test) {
      const to = process.env.NOTIFY_TO || process.env.SMTP_USER;
      const url = `${BASE}/api/subscribe/unsubscribe?token=TEST`;
      const mail = renderNewsletter(digest, { unsubscribeUrl: url });
      const ok = await sendNewsletter({ to, ...mail, unsubscribeUrl: url });
      return NextResponse.json({ test: true, to, sent: ok ? 1 : 0, audience: audience.length });
    }

    let sent = 0;
    const failed = [];
    for (const sub of audience) {
      const url = unsubUrl(sub);
      const mail = renderNewsletter(digest, { unsubscribeUrl: url });
      try {
        if (await sendNewsletter({ to: sub.email, ...mail, unsubscribeUrl: url })) sent++;
        else failed.push(sub.email);
      } catch (err) {
        failed.push(sub.email);
        console.error('[digest] send failed:', sub.email, err?.message);
      }
    }
    // Only ledger a send that actually happened — otherwise a failed run would
    // lock the weekend and George would have to --force past his own ghost.
    if (sent > 0) await metaSet(key, new Date().toISOString());
    return NextResponse.json({ sent, failed: failed.length, audience: audience.length });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
