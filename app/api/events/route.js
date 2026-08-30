import { NextResponse } from 'next/server';
import {
  getEvent, publishedEventsPage, upsertEvent, updateOwnedEventFields, viennaNow,
  mapPins, mapCells, searchEvents, eventsByIds, dedupCandidates, relatedUpcomingEvents,
  recordEventContribution,
} from '../../../lib/db.js';
import { geocodeEvent } from '../../../lib/geocode.js';
import { findDuplicate, mergePlan } from '../../../lib/dedup.js';
import { cleanText } from '../../../lib/entities.js';
import { limit, limitSubject } from '../../../lib/ratelimit.js';
import { spamReason, sanitizeText, submissionProblem } from '../../../lib/moderation.js';
import { notifyOperator } from '../../../lib/mail.js';
import { publicUrl } from '../../../lib/public-url.js';
import { currentAccount, authRequiredMessage } from '../../../lib/account-auth.js';
import { verifyIntakeProof } from '../../../lib/intake-proof.js';
import { isSameOriginMutation } from '../../../lib/request-security.js';

export const dynamic = 'force-dynamic';
const MESSAGES = {
  de: { limited: 'Zu viele Einträge — bitte später wieder.', title: 'Titel ist Pflicht.', titleDate: 'Titel und Datum sind Pflicht.', outside: 'Der Ort liegt außerhalb unseres Gebiets.', date: 'Bitte ein gültiges Datum (nicht vergangen, max. ~1 Jahr voraus) angeben.', meaningful: 'Bitte einen aussagekräftigen Titel angeben.', spam: 'Eintrag wurde als möglicher Spam abgelehnt.', location: 'Ort nicht gefunden — bitte Pin setzen.' },
  en: { limited: 'Too many submissions — please try again later.', title: 'Title is required.', titleDate: 'Title and date are required.', outside: 'The place is outside our coverage area.', date: 'Enter a valid date (not in the past and no more than about one year ahead).', meaningful: 'Enter a meaningful title.', spam: 'The listing was rejected as possible spam.', location: 'Place not found — please set a pin.' },
  bg: { limited: 'Твърде много публикации — опитай отново по-късно.', title: 'Заглавието е задължително.', titleDate: 'Заглавието и датата са задължителни.', outside: 'Мястото е извън обхванатия район.', date: 'Въведи валидна дата (не в миналото и до около една година напред).', meaningful: 'Въведи смислено заглавие.', spam: 'Публикацията беше отхвърлена като възможен спам.', location: 'Мястото не е намерено — постави маркер на картата.' },
};

// Server-side whitelists — kept as plain string constants (not imported from
// lib/icons.js, a React/JSX module) so this route stays server-only. Must
// track EVENT_CATS + PLACE_CATS in lib/icons.js.
const ALL_CATS = new Set([
  'family', 'festival', 'market', 'music', 'party', 'culture', 'food', 'sport', 'workshop',
  'playground', 'pool', 'park', 'trail', 'indoor_play', 'museum', 'zoo', 'climbing',
]);
const KIND_ENUM = new Set(['event', 'place']);
const INOUT_ENUM = new Set(['in', 'out', 'any']);
const TOD_ENUM = new Set(['morning', 'afternoon', 'evening']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ZOOM_TIER = 11.5; // >= pins, < cells (HANDOFF 12.0-12.6 crossfade band)
// Below ZOOM_TIER, a viewport this sparse skips cells and returns real rows:
// grid cells exist for constant cost at scale, but on a thin result set (a
// filtered view, a low-coverage region) they render every lone event as a
// black "1"/"2" count bubble. Rows let the client draw individual dots and
// let MapLibre's supercluster decide per-spot where bubbles are actually
// needed (≥2 points within its 48px radius). Well under mapPins' LIMIT 800,
// so the switch can never truncate.
const SPARSE_PINS_MAX = 50;
const EVENT_CATS = new Set(['family', 'festival', 'market', 'music', 'party', 'culture', 'food', 'sport', 'workshop']);
const PLACE_CATS = new Set(['playground', 'pool', 'park', 'trail', 'indoor_play', 'museum', 'zoo', 'climbing']);
const HOUR_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function cleanOpeningHours(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.always === true) return { always: true };
  const clean = {};
  for (const day of DAYS) {
    if (value[day] == null) continue;
    if (!Array.isArray(value[day]) || value[day].length > 2) return null;
    const ranges = [];
    for (const range of value[day]) {
      if (!Array.isArray(range) || range.length !== 2 || !HOUR_RE.test(range[0]) || !HOUR_RE.test(range[1]) || range[0] >= range[1]) return null;
      ranges.push([range[0], range[1]]);
    }
    if (ranges.length) clean[day] = ranges;
  }
  return Object.keys(clean).length ? clean : null;
}

function boundedAge(value) {
  if (value == null || value === '') return null;
  const age = Number(value);
  return Number.isFinite(age) && age >= 0 && age <= 120 ? age : null;
}

function bad(msg) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function withCanonicalUrl(event) {
  return event ? { ...event, url: publicUrl(`event/${event.id}`) } : event;
}

// Returns [minLng,minLat,maxLng,maxLat] | undefined (missing) | null (invalid).
function parseBbox(raw) {
  if (!raw) return undefined;
  const tokens = raw.split(',');
  // Number('') === 0, so an empty component (`10,,10.1,0.05`) would silently
  // become a valid 0 — require every token to be a non-empty numeric literal.
  if (tokens.length !== 4 || tokens.some((t) => t.trim() === '')) return null;
  const parts = tokens.map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (maxLng - minLng > 20 || maxLat - minLat > 20) return null; // brief: bbox span >20° -> 400
  return [minLng, minLat, maxLng, maxLat];
}

// Shared toggle-filter parsing for the pins/cells modes. Returns null on any
// invalid enum value (route responds 400); booleans degrade to false on
// anything other than '1' rather than erroring (low-risk, no SQL surface).
function parseFilters(sp) {
  const kind = sp.get('kind') || null;
  if (kind && !KIND_ENUM.has(kind)) return null;

  const catsRaw = sp.get('cats');
  const cats = catsRaw ? catsRaw.split(',').map((c) => c.trim()).filter(Boolean) : [];
  if (cats.some((c) => !ALL_CATS.has(c))) return null;

  const inout = sp.get('inout') || 'any';
  if (!INOUT_ENUM.has(inout)) return null;

  const todRaw = sp.get('tod');
  const tod = todRaw ? todRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (tod.some((s) => !TOD_ENUM.has(s))) return null;

  const from = sp.get('from');
  const to = sp.get('to');
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) return null;
  if (!!from !== !!to) return null; // from/to travel as a pair or not at all

  const source = sp.get('source')?.trim() || null;
  if (source && (source.length > 160 || /[\u0000-\u001f\u007f]/.test(source))) return null;

  return {
    kind, cats, inout, tod, source,
    free: sp.get('free') === '1',
    kids: sp.get('kids') === '1',
    community: sp.get('community') === '1',
    when: from && to ? { from, to } : null,
  };
}

export async function GET(req) {
  const sp = req.nextUrl.searchParams;

  const id = sp.get('id');
  if (id) {
    const event = await getEvent(id);
    const related = event ? await relatedUpcomingEvents(event) : { series: [], venue: [] };
    return NextResponse.json({
      event: withCanonicalUrl(event),
      related: {
        series: related.series.map(withCanonicalUrl),
        venue: related.venue.map(withCanonicalUrl),
      },
    });
  }

  // Saved-list resolution: usually NOT in the current viewport, so this is a
  // plain id lookup, never bbox-scoped (brief: don't prune ids that are just
  // off-screen).
  const idsRaw = sp.get('ids');
  if (idsRaw !== null) {
    const ids = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length || ids.length > 100 || ids.some((s) => !/^\d+$/.test(s))) {
      return bad('ids must be 1-100 comma-separated integers');
    }
    return NextResponse.json({ events: (await eventsByIds(ids)).map(withCanonicalUrl) });
  }

  // Global text search — independent of the viewport.
  const q = sp.get('q');
  if (q !== null) {
    const trimmed = q.trim();
    if (!trimmed) return NextResponse.json({ results: [] });
    return NextResponse.json({ results: (await searchEvents(trimmed)).map(withCanonicalUrl) });
  }

  const view = sp.get('view');
  if (view === 'map') {
    const bbox = parseBbox(sp.get('bbox'));
    if (bbox === undefined) return bad('bbox is required for view=map');
    if (bbox === null) return bad('bbox is invalid');

    const zoom = Number(sp.get('zoom'));
    if (!Number.isFinite(zoom) || zoom < 0 || zoom > 22) return bad('zoom is required and must be 0-22');

    const filters = parseFilters(sp);
    if (!filters) return bad('invalid filter parameter');

    if (zoom >= ZOOM_TIER) {
      const { events, total, truncated } = await mapPins({ bbox, ...filters });
      return NextResponse.json({ mode: 'pins', events, total, truncated });
    }
    // ~64px cells at the given zoom: 360deg / 2^zoom tiles, quartered.
    const cellDeg = 360 / Math.pow(2, Math.round(zoom)) / 4;
    const { cells, total } = await mapCells({ bbox, cellDeg, ...filters });
    if (total <= SPARSE_PINS_MAX) {
      const { events, truncated } = await mapPins({ bbox, ...filters });
      return NextResponse.json({ mode: 'pins', events, total, truncated });
    }
    return NextResponse.json({ mode: 'cells', cells, total });
  }
  if (view) return bad('unknown view');

  // Public machine-readable catalog: bounded keyset pagination. The old
  // no-param response dumped every event (including internal embeddings)
  // into one request and was the primary Supabase egress multiplier.
  const cursor = sp.get('cursor');
  if (cursor !== null && !/^\d+$/.test(cursor)) return bad('cursor must be an event id');
  const limitRaw = sp.get('limit');
  const pageLimit = limitRaw === null ? 100 : Number(limitRaw);
  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
    return bad('limit must be an integer from 1 to 100');
  }
  const { events, nextCursor } = await publishedEventsPage({
    afterId: cursor,
    limit: pageLimit,
  });
  return NextResponse.json(
    { events: events.map(withCanonicalUrl), next_cursor: nextCursor },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}

export async function POST(req) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  }
  const messages = MESSAGES[req.headers.get('x-okolo-lang')] || MESSAGES.en;
  const account = await currentAccount();
  if (!account) {
    return NextResponse.json({ error: authRequiredMessage(req), code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Invalid submission.');
  // Honeypot before quota consumption: bots get fake success without spending
  // the global allowance and denying real customers the ability to publish.
  if (raw.website) { console.warn('[intake] publish: honeypot tripped (silent fake-ok)'); return NextResponse.json({ ok: true, id: null }); }

  // Durable network + account limits survive serverless isolation. The account
  // ceiling follows a user across rotating IPs; the global circuit breaker caps
  // a coordinated flood of otherwise valid entries.
  const rl = await limit(req, 'submit', { perHour: 20, perDay: 200, globalPerDay: 150 })
    || await limitSubject('account', account.id, 'submit_account', { perHour: 5, perDay: 20 });
  if (rl) {
    console.warn(`[intake] publish: rate-limited (scope=${rl.scope} window=${rl.window})`);
    return NextResponse.json({
      error: messages.limited,
      code: 'RATE_LIMITED',
      rateLimit: {
        action: 'publish', scope: rl.scope === 'global' ? 'service' : rl.scope === 'ip' ? 'network' : 'account', window: rl.window,
        ...(rl.scope === 'global' ? {} : { max: rl.max }), perHour: rl.scope === 'ip' ? 20 : 5, perDay: rl.scope === 'ip' ? 200 : 20,
      },
    }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }
  // Sanitize every free-text field (strip tags/control chars) before anything
  // else looks at it.
  const body = {
    ...raw,
    title: sanitizeText(raw.title, 200),
    description: sanitizeText(raw.description, 500),
    venue: sanitizeText(raw.venue, 120),
    address: sanitizeText(raw.address, 200),
    town: sanitizeText(raw.town, 80),
  };
  // Linkback/photo provenance is trusted only when the corresponding extraction
  // endpoint signed it for this account. Direct API callers cannot forge an
  // “AI-vetted” submission by inventing source_url or photo_path.
  let sourceUrl = null;
  if (typeof raw.source_url === 'string') {
    try {
      const u = new URL(raw.source_url.trim());
      if ((u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password) sourceUrl = u.href.slice(0, 500);
    } catch { /* not a URL → no linkback */ }
  }
  const rawPhotoPath = typeof raw.photo_path === 'string' && /^scan-\d+\.(?:jpg|png|webp|gif)$/.test(raw.photo_path)
    ? raw.photo_path
    : null;
  const trustedPhoto = rawPhotoPath && verifyIntakeProof(raw.intake_proof, account.id, 'photo', rawPhotoPath)
    ? rawPhotoPath
    : null;
  const trustedSourceUrl = sourceUrl && verifyIntakeProof(raw.intake_proof, account.id, 'link', sourceUrl)
    ? sourceUrl
    : null;
  const kind = body.kind === 'place' ? 'place' : 'event';
  const allowedCats = kind === 'place' ? PLACE_CATS : EVENT_CATS;
  const categories = Array.isArray(body.categories)
    ? [...new Set(body.categories.filter((value) => typeof value === 'string' && allowedCats.has(value)))].slice(0, 3)
    : [];
  const openingHours = kind === 'place' ? cleanOpeningHours(body.opening_hours) : null;
  const seasonal = kind === 'place' ? sanitizeText(body.seasonal, 80) : null;
  // Places are evergreen (no date); events still require starts_at.
  if (!body.title || (kind === 'event' && !body.starts_at)) {
    console.warn(`[intake] publish: rejected — missing ${!body.title ? 'title' : 'date'} (kind=${kind})`);
    return NextResponse.json({ error: kind === 'place' ? messages.title : messages.titleDate }, { status: 400 });
  }
  // Plausibility: date format + range (nothing far past/future), coords in Austria.
  const problem = submissionProblem(body, kind, viennaNow().slice(0, 10));
  if (problem) {
    console.warn(`[intake] publish: rejected — ${problem} (title="${(body.title || '').slice(0, 60)}" start=${body.starts_at || null} lat=${body.lat} lng=${body.lng})`);
    const msg = problem === 'coords_outside_area'
      ? messages.outside
      : problem.startsWith('date') || problem.startsWith('bad_date')
        ? messages.date
        : messages.meaningful;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  // Basic spam/abuse guard for anonymous content. Scan (photo_path) and link
  // (source_url) submissions are AI-vetted, so only the keyword blocklist applies;
  // hand-typed entries get the full heuristic pass (see spamReason).
  const strict = !trustedPhoto && !trustedSourceUrl;
  const spam = spamReason(body.title, body.description, { strict });
  if (spam) {
    console.warn(`[intake] publish: rejected — spam (${spam}, strict=${strict}) title="${(body.title || '').slice(0, 60)}"`);
    return NextResponse.json({ error: messages.spam }, { status: 422 });
  }

  let lat = body.lat, lng = body.lng, geo_precision = body.geo_precision || 'venue';
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const geo = await geocodeEvent(body);
    if (!geo) {
      console.warn(`[intake] publish: rejected — geocode failed (town="${body.town || ''}" venue="${body.venue || ''}" address="${body.address || ''}")`);
      return NextResponse.json({ error: messages.location }, { status: 422 });
    }
    ({ lat, lng } = geo);
    geo_precision = geo.geo_precision;
  }

  let ends_at = body.ends_at || null;
  if (ends_at && body.starts_at && ends_at <= body.starts_at) ends_at = null;

  // Same-event-twice check #2: this event may already be on the map (crawled
  // from a different source, or scanned once before). Events only — places
  // are evergreen singletons with no natural "duplicate" concept here.
  if (kind === 'event') {
    // Decode entities on the candidate FIRST: stored rows were cleaned
    // at the write boundary, so an incoming "&#8211;" (→ stray "8211" token in
    // dedup's normalizer) would fail the title match and insert a real duplicate.
    const candidate = {
      title: cleanText(body.title), starts_at: body.starts_at, ends_at, town: cleanText(body.town) || null, lat, lng,
      geo_precision,
      description: body.description || null, address: cleanText(body.address) || null, venue: cleanText(body.venue) || null,
      is_free: typeof body.is_free === 'boolean' ? body.is_free : null,
      age_min: boundedAge(body.age_min), age_max: boundedAge(body.age_max),
      indoor: typeof body.indoor === 'boolean' ? body.indoor : null, photo_path: trustedPhoto,
      categories,
    };
    const candidates = await dedupCandidates(
      body.starts_at.slice(0, 10),
      candidate.town,
      null,
      candidate,
    );
    const match = findDuplicate(candidate, candidates);
    if (match) {
      const patch = mergePlan(match, candidate);
      if (body.lat != null && body.lng != null) Object.assign(patch, { lat, lng, geo_precision });
      const update = await updateOwnedEventFields(account.id, match.id, patch);
      const contributionKind = trustedPhoto ? 'photo' : trustedSourceUrl ? 'link' : 'manual';
      await recordEventContribution(account.id, match.id, contributionKind, { merged: update.protected });
      console.log(`[intake] publish: ${update.protected ? 'MATCHED protected' : 'UPDATED owned'} ${match.id} title="${(body.title || '').slice(0, 60)}"`);
      return NextResponse.json({ ok: true, merged: update.protected, updated: update.updated, id: match.id, lat: update.updated ? lat : match.lat, lng: update.updated ? lng : match.lng });
    }
  }

  const res = await upsertEvent({
    kind,
    title: String(body.title).slice(0, 200),
    description: body.description ? String(body.description).slice(0, 500) : null,
    starts_at: kind === 'event' ? body.starts_at : null,
    ends_at,
    all_day: body.all_day ? 1 : 0,
    lat, lng, geo_precision,
    venue: body.venue || null,
    address: body.address || null,
    town: body.town || null,
    categories,
    is_free: typeof body.is_free === 'boolean' ? body.is_free : null,
    age_min: boundedAge(body.age_min),
    age_max: boundedAge(body.age_max),
    indoor: typeof body.indoor === 'boolean' ? body.indoor : null,
    emoji: '📌',
    photo_path: trustedPhoto,
    opening_hours: openingHours,
    seasonal,
    // Genuine public submissions: photo scans carry a photo_path, everything
    // else (typed place/event) is a hand-typed community entry. source_name is
    // left null so the detail view renders a localized "community" label.
    src_kind: trustedPhoto ? 'user_photo' : trustedSourceUrl ? 'user_link' : 'user_manual',
    source_name: null,
    source_url: trustedSourceUrl,
  }, { actorUserId: account.id });
  const contributionKind = trustedPhoto ? 'photo' : trustedSourceUrl ? 'link' : 'manual';
  await recordEventContribution(account.id, res.id, contributionKind, { merged: !!res.protected });
  if (res.protected) {
    return NextResponse.json({ ok: true, merged: true, id: res.id, lat: res.lat, lng: res.lng });
  }

  // Every community submission goes live immediately — so tell the operator,
  // with a one-click remove link (see /api/admin/remove).
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events';
  const removeUrl = process.env.ADMIN_TOKEN
    ? `${base}/api/admin/remove?id=${res.id}&token=${process.env.ADMIN_TOKEN}`
    : '(ADMIN_TOKEN nicht gesetzt — Eintrag in Supabase entfernen)';
  await notifyOperator(
    `Neuer Community-Eintrag: ${body.title}`,
    [
      `${kind === 'place' ? 'Ort' : 'Event'} von einem Nutzer veröffentlicht:`,
      '',
      `Titel: ${body.title}`,
      kind === 'event' ? `Datum: ${body.starts_at}` : null,
      `Ort: ${[body.venue, body.address, body.town].filter(Boolean).join(', ') || '—'}`,
      body.description ? `Beschreibung: ${body.description}` : null,
      `Quelle: ${trustedPhoto ? 'Poster-Scan' : trustedSourceUrl || 'Formular'}`,
      '',
      `Ansehen: ${base}/event/${res.id}`,
      `Entfernen: ${removeUrl}`,
    ].filter(Boolean).join('\n')
  );
  console.log(`[intake] publish: OK ${res.updated ? 'updated' : 'created'} ${res.id} (kind=${kind}, src=${trustedPhoto ? 'user_photo' : trustedSourceUrl ? 'user_link' : 'user_manual'}) title="${(body.title || '').slice(0, 60)}"`);
  return NextResponse.json({ ok: true, id: res.id, updated: res.updated, lat, lng, geo_precision });
}
