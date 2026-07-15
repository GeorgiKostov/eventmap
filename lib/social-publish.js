// ONE place decides how a post leaves the building for Meta (Instagram +
// Facebook) — same rule as lib/mail.js for email and lib/extract.js for AI
// models: feature code never talks to graph.facebook.com directly.
//
// One Meta Business account for the whole product for now (all city channels
// post through the same IG/FB pair). Per-city Meta accounts are a plausible
// later extension (separate tokens/ids per channel) but out of scope here —
// see docs/ops/meta-api-setup.md.
//
// Env:
//   META_ACCESS_TOKEN   — Business Manager SYSTEM USER token (non-expiring),
//                         scopes: instagram_basic, instagram_content_publish,
//                         pages_manage_posts, pages_read_engagement.
//   IG_USER_ID          — the Instagram professional account's IG User ID.
//   FB_PAGE_ID          — the Facebook Page id.
//   META_GRAPH_VERSION  — optional, default 'v23.0'.
//
// socialConfigured() tells callers what's usable; missingSocialEnv() names the
// exact vars for an honest 503. publishInstagramCarousel/publishFacebookPost
// either return a real { id, permalink } or throw — they never return a fake
// success. Ledger writes belong to the CALLER, and only after these resolve.

import { renderCaption, weekendUrl, loadDigestFor } from './digest.js';

const GRAPH_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 2_000;
const POLL_CAP_MS = 45_000;
// Meta rejects IG captions over 2200 chars — check BEFORE creating containers,
// or the failure arrives only after ten media uploads have already run.
const IG_CAPTION_MAX = 2200;
// An in-flight claim older than this belongs to a request that died without
// recording an outcome (e.g. the serverless function was killed mid-publish —
// the post may be LIVE with no ledger entry). Never silently retry past it.
const CLAIM_TTL_MS = 5 * 60_000;

function graphVersion() {
  return process.env.META_GRAPH_VERSION || 'v23.0';
}

function graphBase() {
  return `https://graph.facebook.com/${graphVersion()}`;
}

export function socialConfigured() {
  const token = !!process.env.META_ACCESS_TOKEN;
  return {
    instagram: token && !!process.env.IG_USER_ID,
    facebook: token && !!process.env.FB_PAGE_ID,
  };
}

// Exact missing env var names, for honest error messages (mirrors the mail
// 503 message style — George needs to know precisely what to set).
export function missingSocialEnv(target) {
  const missing = [];
  if (!process.env.META_ACCESS_TOKEN) missing.push('META_ACCESS_TOKEN');
  if (target === 'instagram' && !process.env.IG_USER_ID) missing.push('IG_USER_ID');
  if (target === 'facebook' && !process.env.FB_PAGE_ID) missing.push('FB_PAGE_ID');
  return missing;
}

// One helper for every Graph call. `method` GET/POST; `params` become the
// query string (GET) or a form-encoded body (POST). Graph errors are
// preserved verbatim in the thrown message — this is George's debugging
// surface, never swallow the detail.
async function graph(endpoint, { method = 'GET', params = {}, accessToken } = {}) {
  const token = accessToken || process.env.META_ACCESS_TOKEN;
  const url = new URL(`${graphBase()}${endpoint}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);
  try {
    let res;
    if (method === 'GET') {
      for (const [k, v] of Object.entries({ ...params, access_token: token })) {
        if (v != null) url.searchParams.set(k, v);
      }
      res = await fetch(url, { method: 'GET', signal: controller.signal });
    } else {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...params, access_token: token })) {
        if (v != null) body.set(k, v);
      }
      res = await fetch(url, { method: 'POST', body, signal: controller.signal });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const e = json.error || {};
      throw new Error(
        `Meta ${endpoint}: ${e.message || `HTTP ${res.status}`} (code ${e.code ?? res.status}, subcode ${e.error_subcode ?? '-'})`,
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForContainer(containerId, accessToken) {
  const deadline = Date.now() + POLL_CAP_MS;
  for (;;) {
    const status = await graph(`/${containerId}`, {
      params: { fields: 'status_code,status' },
      accessToken,
    });
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR') {
      throw new Error(`Meta /${containerId} container failed: ${status.status || 'ERROR'}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Meta /${containerId} container still ${status.status_code || 'IN_PROGRESS'} after ${POLL_CAP_MS}ms`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// Publish an Instagram carousel (or a single image if only one URL is given —
// IG rejects carousels with fewer than 2 children). Returns { id, permalink }.
export async function publishInstagramCarousel({ imageUrls, caption }) {
  const igUserId = process.env.IG_USER_ID;
  if (!imageUrls?.length) throw new Error('publishInstagramCarousel: no images');
  if ((caption || '').length > IG_CAPTION_MAX) {
    throw new Error(
      `publishInstagramCarousel: caption is ${caption.length} chars (Instagram max ${IG_CAPTION_MAX}) — drop a pick or shorten on the desk`,
    );
  }

  let creationId;
  if (imageUrls.length === 1) {
    const single = await graph(`/${igUserId}/media`, {
      method: 'POST',
      params: { image_url: imageUrls[0], caption },
    });
    creationId = single.id;
  } else {
    // Children in parallel: sequential creation of 10 containers is what
    // pushed the worst case past the route's 60s budget.
    const children = await Promise.all(
      imageUrls.map((image_url) =>
        graph(`/${igUserId}/media`, {
          method: 'POST',
          params: { image_url, is_carousel_item: 'true' },
        }).then((c) => c.id),
      ),
    );
    const carousel = await graph(`/${igUserId}/media`, {
      method: 'POST',
      params: { media_type: 'CAROUSEL', children: children.join(','), caption },
    });
    creationId = carousel.id;
  }

  await waitForContainer(creationId);

  const published = await graph(`/${igUserId}/media_publish`, {
    method: 'POST',
    params: { creation_id: creationId },
  });

  let permalink = null;
  try {
    const info = await graph(`/${published.id}`, { params: { fields: 'permalink' } });
    permalink = info.permalink || null;
  } catch {
    // Best-effort only — the post is live regardless of whether we can fetch
    // its permalink right now.
  }

  return { id: published.id, permalink };
}

// Resolve a Page access token via the system-user token; fall back to using
// META_ACCESS_TOKEN directly if that fetch fails (some token setups already
// hand out page tokens, where this lookup can be redundant). The failure is
// NOT swallowed silently: it's logged in full and carried along, so if the
// fallback token then fails too, the error George sees names the real first
// failure (usually "Page asset not assigned to the system user") instead of
// sending him to debug the wrong call.
async function pageAccessToken(pageId) {
  try {
    const info = await graph(`/${pageId}`, { params: { fields: 'access_token' } });
    if (info.access_token) return { token: info.access_token, warning: null };
    return { token: process.env.META_ACCESS_TOKEN, warning: `page token lookup returned no access_token` };
  } catch (err) {
    console.warn(`[social] page-token fetch failed, falling back to META_ACCESS_TOKEN directly: ${err.message}`);
    return { token: process.env.META_ACCESS_TOKEN, warning: err.message };
  }
}

// Multi-photo Facebook Page post. `link`, if given, is appended as its own
// line at the end of `message` (a feed post with attached_media can't also
// take a separate `link` param). Returns { id, permalink }.
export async function publishFacebookPost({ imageUrls, message, link }) {
  const pageId = process.env.FB_PAGE_ID;
  if (!imageUrls?.length) throw new Error('publishFacebookPost: no images');

  const { token: pageToken, warning: tokenWarning } = await pageAccessToken(pageId);
  const fullMessage = link ? `${message}\n\n${link}` : message;

  let photoIds;
  try {
    // Parallel for the same reason as the IG children — duration budget.
    photoIds = await Promise.all(
      imageUrls.map((url) =>
        graph(`/${pageId}/photos`, {
          method: 'POST',
          params: { url, published: 'false' },
          accessToken: pageToken,
        }).then((p) => p.id),
      ),
    );
  } catch (err) {
    if (tokenWarning) err.message += ` — NB the page-token fetch had already failed (${tokenWarning}); that is likely the real problem`;
    throw err;
  }

  const attached_media = JSON.stringify(photoIds.map((id) => ({ media_fbid: id })));
  const post = await graph(`/${pageId}/feed`, {
    method: 'POST',
    params: { message: fullMessage, attached_media },
    accessToken: pageToken,
  });

  let permalink = null;
  try {
    const info = await graph(`/${post.id}`, { params: { fields: 'permalink_url' }, accessToken: pageToken });
    permalink = info.permalink_url || null;
  } catch {
    // Best-effort — the post is live either way.
  }

  return { id: post.id, permalink };
}

// The Facebook message: renderCaption() already ends with the weekend URL
// (its captionOutro line), so blindly appending weekendUrl() again — as a
// literal reading of "append the link" would do — prints the same link
// twice in every post. Dedupe instead: append only if it isn't already
// there. Shared by the route (dry-run + real publish) and the CLI so all
// three surfaces produce byte-identical messages.
export function facebookMessage(digest) {
  const caption = renderCaption(digest);
  const link = weekendUrl(digest);
  return caption.includes(link) ? caption : `${caption}\n\n${link}`;
}

// Pure helper shared by the route and the CLI: the absolute card image URLs
// for a frozen digest (cover + one per item), capped at IG's 10-image
// carousel ceiling (the digest ceiling already guarantees <=10, this is a
// defensive slice, not the real limit enforcement).
export function cardUrls(channel, digest, base) {
  const BASE = (base || process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');
  const friday = digest.window.friday;
  const urls = Array.from(
    { length: digest.items.length + 1 },
    (_, i) => `${BASE}/api/social/card?channel=${channel.slug}&slide=${i}&weekend=${friday}`,
  );
  return urls.slice(0, 10);
}

// The ledger key both the route and the CLI read/write, so a manual CLI
// publish and a desk-button publish can never double-post the same weekend.
export function postedKey(target, slug, friday) {
  const kind = target === 'instagram' ? 'ig' : 'fb';
  return `posted:${kind}:${slug}:${friday}`;
}

// Shared publish-with-ledger step (route + CLI twin, one definition — see
// tasks/lessons.md on twins drifting). Throws on any failure or misuse;
// callers decide how to render that (503/502/console.error).
//
// Two markers, two meanings (don't conflate them):
//   posted:…           — the SUCCESS ledger, written only after Meta returned
//                        an id (never before — lessons.md).
//   posted:…:inflight  — an atomic CLAIM taken before any Graph call. It makes
//                        concurrent publishes lose cleanly (two desk tabs, or
//                        desk + CLI), and it survives a hard kill: if the
//                        function died mid-publish the post may be LIVE with no
//                        ledger, and the stale claim is the only evidence. A
//                        later attempt then refuses to run without force and
//                        says "check the page first" instead of confidently
//                        posting a duplicate.
// Normal failures release the claim in `finally`; only a process kill leaves it.
export async function publishAndLedger({ channel, digest, target, force, metaGet, metaSet, metaClaim, metaDelete }) {
  const key = postedKey(target, channel.slug, digest.window.friday);
  if (!force) {
    const existing = await metaGet(key);
    if (existing) {
      const err = new Error('already posted for this weekend');
      err.code = 'ALREADY_POSTED';
      err.existing = JSON.parse(existing);
      throw err;
    }
  }

  const claimKey = `${key}:inflight`;
  const claimed = await metaClaim(claimKey, JSON.stringify({ at: new Date().toISOString() }));
  if (!claimed) {
    const prior = JSON.parse((await metaGet(claimKey)) || '{}');
    const age = Date.now() - (Date.parse(prior.at) || 0);
    if (age < CLAIM_TTL_MS && !force) {
      const err = new Error('another publish for this weekend is running right now — wait for it to finish');
      err.code = 'PUBLISH_IN_FLIGHT';
      throw err;
    }
    if (!force) {
      const err = new Error(
        `a previous ${target} publish attempt did not record an outcome — the post MAY be live. Check the ${target} page first; if nothing was posted, retry with force`,
      );
      err.code = 'UNKNOWN_OUTCOME';
      throw err;
    }
    // force = the operator has checked; take the claim over.
    await metaSet(claimKey, JSON.stringify({ at: new Date().toISOString() }));
  }

  try {
    const imageUrls = cardUrls(channel, digest);

    let result;
    if (target === 'instagram') {
      result = await publishInstagramCarousel({ imageUrls, caption: renderCaption(digest) });
    } else if (target === 'facebook') {
      result = await publishFacebookPost({ imageUrls, message: facebookMessage(digest) });
    } else {
      throw new Error(`publishAndLedger: unknown target ${target}`);
    }

    const record = { id: result.id, permalink: result.permalink, at: new Date().toISOString() };

    // Meta fetches the card images asynchronously from the mutable weekend
    // snapshot — a Regenerate clicked while this ran can make the live photos
    // disagree with the caption we already sent. Detect and say so; only the
    // operator can judge the live post.
    const nowSnap = await loadDigestFor(channel, digest.window.friday);
    if (nowSnap) {
      const nowIds = (nowSnap.items || []).map((it) => String(it.id));
      const usedIds = (digest.items || []).map((it) => String(it.id));
      if (JSON.stringify(nowIds) !== JSON.stringify(usedIds)) {
        record.warning = 'the digest snapshot changed while publishing — open the live post and verify images match the caption';
      }
    }

    await metaSet(key, JSON.stringify(record));
    return record;
  } finally {
    await metaDelete(claimKey);
  }
}
