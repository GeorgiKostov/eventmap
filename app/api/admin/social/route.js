import { NextResponse } from 'next/server';
import { getChannel } from '../../../../lib/city-channels.js';
import { loadDigest, renderCaption } from '../../../../lib/digest.js';
import { metaGet, metaSet, metaClaim, metaDelete } from '../../../../lib/db.js';
import { isAdmin } from '../../../../lib/admin-auth.js';
import {
  socialConfigured,
  missingSocialEnv,
  cardUrls,
  postedKey,
  publishAndLedger,
  facebookMessage,
} from '../../../../lib/social-publish.js';

// Meta publishing for the Thursday desk (docs/ops/meta-api-setup.md). One
// route, two targets: Instagram carousel + Facebook Page multi-photo post,
// both built from the SAME frozen weekly digest the newsletter/cards use —
// never a fresh AI build (publishing must not trigger a build/AI call).
//
//   GET  ?channel=<slug>                          → configured + posted state
//   POST { channel, target, force?, test? }       → publish (or dry-run)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TARGETS = ['instagram', 'facebook'];

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const channel = getChannel(searchParams.get('channel') || 'linz');
  if (!channel) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

  const digest = await loadDigest(channel);
  const configured = socialConfigured();
  if (!digest) {
    return NextResponse.json({
      configured,
      posted: { instagram: null, facebook: null },
      snapshot: false,
    });
  }

  const friday = digest.window.friday;
  const [ig, fb] = await Promise.all([
    metaGet(postedKey('instagram', channel.slug, friday)),
    metaGet(postedKey('facebook', channel.slug, friday)),
  ]);
  return NextResponse.json({
    configured,
    posted: {
      instagram: ig ? JSON.parse(ig) : null,
      facebook: fb ? JSON.parse(fb) : null,
    },
    snapshot: true,
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const channel = getChannel(body.channel || 'linz');
  const target = body.target;
  if (!channel || !TARGETS.includes(target)) {
    return NextResponse.json({ error: 'unknown channel or target' }, { status: 400 });
  }

  // Publishing reads the frozen snapshot ONLY — loadOrBuildDigest would let a
  // publish click silently freeze a stale pick set and trigger a paid AI call.
  const digest = await loadDigest(channel);
  if (!digest) {
    return NextResponse.json(
      { error: 'no digest snapshot for this weekend — prepare it on the desk first' },
      { status: 409 },
    );
  }
  if (!digest.items.length) {
    return NextResponse.json({ error: 'digest has no items to post' }, { status: 400 });
  }

  if (body.test) {
    // Dry run — the exact payload that would be sent, no Graph call. It is
    // side-effect-free, so it comes BEFORE the credentials and already-posted
    // checks: the preview is most useful precisely when credentials don't
    // exist yet, and it must keep working after a post has gone out.
    const imageUrls = cardUrls(channel, digest);
    const caption = target === 'instagram' ? renderCaption(digest) : facebookMessage(digest);
    return NextResponse.json({ dryRun: true, imageUrls, caption });
  }

  const missing = missingSocialEnv(target);
  if (missing.length) {
    return NextResponse.json(
      { error: `No ${target} credentials — nothing was posted. Set ${missing.join(', ')}.` },
      { status: 503 },
    );
  }

  try {
    const record = await publishAndLedger({
      channel, digest, target, force: !!body.force,
      metaGet, metaSet, metaClaim, metaDelete,
    });
    return NextResponse.json({ posted: true, id: record.id, permalink: record.permalink, warning: record.warning });
  } catch (err) {
    if (err.code === 'ALREADY_POSTED') {
      return NextResponse.json({ error: 'already posted for this weekend', posted: err.existing }, { status: 409 });
    }
    if (err.code === 'PUBLISH_IN_FLIGHT' || err.code === 'UNKNOWN_OUTCOME') {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Graph errors are informative — pass the message through verbatim, it's
    // George's debugging surface.
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
