import { NextResponse } from 'next/server';
import { getChannel } from '../../../../lib/city-channels.js';
import { loadDigest, renderCaption, renderItemCaption } from '../../../../lib/digest.js';
import { metaGet, metaSet, metaClaim, metaDelete } from '../../../../lib/db.js';
import { isAdmin } from '../../../../lib/admin-auth.js';
import {
  socialConfigured,
  missingSocialEnv,
  cardUrls,
  postedKey,
  publishAndLedger,
  facebookMessage,
  itemPostedKey,
  itemSlide,
  cardUrlForItem,
  publishItemAndLedger,
  nextUnpostedItem,
} from '../../../../lib/social-publish.js';

// Meta publishing for the Thursday desk (docs/ops/meta-api-setup.md). One
// route, two targets: Instagram carousel + Facebook Page multi-photo post,
// both built from the SAME frozen weekly digest the newsletter/cards use —
// never a fresh AI build (publishing must not trigger a build/AI call).
// Alongside the bulk carousel, each event can also be posted on its own — same
// frozen digest, its own pinned card + caption, its own per-event ledger key
// (itemPostedKey) so a re-post never re-posts an event already sent.
//
//   GET  ?channel=<slug>                                  → configured + bulk
//                                                            posted state +
//                                                            per-item state
//   POST { channel, target, force?, test? }               → bulk publish (or
//                                                            dry-run)
//   POST { channel, target, itemId, force?, test? }        → single-item
//                                                            publish (or
//                                                            dry-run)
//   POST { channel, target, next: true, force?, test? }    → publish the next
//                                                            unposted item
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
      items: [],
    });
  }

  const friday = digest.window.friday;
  const [igRaw, fbRaw] = await Promise.all([
    metaGet(postedKey('instagram', channel.slug, friday)),
    metaGet(postedKey('facebook', channel.slug, friday)),
  ]);
  const igBulk = igRaw ? JSON.parse(igRaw) : null;
  const fbBulk = fbRaw ? JSON.parse(fbRaw) : null;
  // An event counts as posted if it went out on its OWN or inside the carousel —
  // so the desk can't offer a silent duplicate of something already broadcast.
  const viaCarousel = (rec) => (rec ? { viaCarousel: true, id: rec.id, permalink: rec.permalink, at: rec.at } : null);
  const items = await Promise.all(
    digest.items.map(async (it) => {
      const [igItem, fbItem] = await Promise.all([
        metaGet(itemPostedKey('instagram', channel.slug, friday, it.id)),
        metaGet(itemPostedKey('facebook', channel.slug, friday, it.id)),
      ]);
      return {
        id: it.id,
        title: it.title,
        cat: it.cat,
        slide: itemSlide(digest, it),
        posted: {
          instagram: igItem ? JSON.parse(igItem) : viaCarousel(igBulk),
          facebook: fbItem ? JSON.parse(fbItem) : viaCarousel(fbBulk),
        },
      };
    }),
  );
  return NextResponse.json({
    configured,
    posted: { instagram: igBulk, facebook: fbBulk },
    snapshot: true,
    items,
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

  // ---- single-item / "next unposted" paths ----
  if (body.itemId != null || body.next === true) {
    let item;
    if (body.next === true) {
      const friday = digest.window.friday;
      // If the whole carousel already went out, every event is posted — none is
      // "next", even though the per-item keys are empty.
      if (await metaGet(postedKey(target, channel.slug, friday))) {
        return NextResponse.json({ error: `all events already went out in the ${target} carousel this weekend` }, { status: 409 });
      }
      const postedFlags = await Promise.all(
        digest.items.map((it) => metaGet(itemPostedKey(target, channel.slug, friday, it.id))),
      );
      const postedIds = new Set(digest.items.filter((_, i) => postedFlags[i]).map((it) => String(it.id)));
      item = nextUnpostedItem(digest, target, postedIds);
      if (!item) {
        return NextResponse.json({ error: 'all events already posted for this platform' }, { status: 409 });
      }
    } else {
      item = digest.items.find((it) => String(it.id) === String(body.itemId));
      if (!item) {
        return NextResponse.json(
          { error: 'item not in current digest — it may have been regenerated away' },
          { status: 404 },
        );
      }
    }

    if (body.test) {
      // Dry run — side-effect-free, so it comes BEFORE the credentials and
      // already-posted checks, same rule as the bulk path.
      const imageUrls = [cardUrlForItem(channel, digest, item)];
      const caption = renderItemCaption(digest, item);
      return NextResponse.json({ dryRun: true, imageUrls, caption, item: { id: item.id, title: item.title } });
    }

    const missing = missingSocialEnv(target);
    if (missing.length) {
      return NextResponse.json(
        { error: `No ${target} credentials — nothing was posted. Set ${missing.join(', ')}.` },
        { status: 503 },
      );
    }

    try {
      const record = await publishItemAndLedger({
        channel, digest, item, target, force: !!body.force,
        metaGet, metaSet, metaClaim, metaDelete,
      });
      return NextResponse.json({
        posted: true, id: record.id, permalink: record.permalink, warning: record.warning,
        item: { id: item.id, title: item.title },
      });
    } catch (err) {
      if (err.code === 'ALREADY_POSTED') {
        return NextResponse.json({ error: 'already posted for this weekend', posted: err.existing }, { status: 409 });
      }
      if (err.code === 'ALREADY_IN_CAROUSEL') {
        return NextResponse.json({ error: err.message, posted: err.existing }, { status: 409 });
      }
      if (err.code === 'PUBLISH_IN_FLIGHT' || err.code === 'UNKNOWN_OUTCOME') {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
  }

  // ---- bulk carousel path ----
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
    if (err.code === 'ITEMS_ALREADY_POSTED') {
      // Some events already went out individually — the desk must confirm the
      // repeat (force) rather than silently re-broadcast them in a carousel.
      return NextResponse.json({ error: err.message, itemIds: err.ids }, { status: 409 });
    }
    if (err.code === 'PUBLISH_IN_FLIGHT' || err.code === 'UNKNOWN_OUTCOME') {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Graph errors are informative — pass the message through verbatim, it's
    // George's debugging surface.
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
