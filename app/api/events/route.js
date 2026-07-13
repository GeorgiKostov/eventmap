import { NextResponse } from 'next/server';
import { getEvent, publishedEvents, publishedMapEvents, upsertEvent, updateEventFields, viennaNow } from '../../../lib/db.js';
import { geocodeEvent } from '../../../lib/geocode.js';
import { findDuplicate, mergePlan } from '../../../lib/dedup.js';
import { limit } from '../../../lib/ratelimit.js';
import { spamReason, sanitizeText, submissionProblem } from '../../../lib/moderation.js';
import { notifyOperator } from '../../../lib/mail.js';

export const dynamic = 'force-dynamic';
const MESSAGES = {
  de: { limited: 'Zu viele Einträge — bitte später wieder.', title: 'Titel ist Pflicht.', titleDate: 'Titel und Datum sind Pflicht.', outside: 'Der Ort liegt außerhalb unseres Gebiets.', date: 'Bitte ein gültiges Datum (nicht vergangen, max. ~1 Jahr voraus) angeben.', meaningful: 'Bitte einen aussagekräftigen Titel angeben.', spam: 'Eintrag wurde als möglicher Spam abgelehnt.', location: 'Ort nicht gefunden — bitte Pin setzen.' },
  en: { limited: 'Too many submissions — please try again later.', title: 'Title is required.', titleDate: 'Title and date are required.', outside: 'The place is outside our coverage area.', date: 'Enter a valid date (not in the past and no more than about one year ahead).', meaningful: 'Enter a meaningful title.', spam: 'The listing was rejected as possible spam.', location: 'Place not found — please set a pin.' },
  bg: { limited: 'Твърде много публикации — опитай отново по-късно.', title: 'Заглавието е задължително.', titleDate: 'Заглавието и датата са задължителни.', outside: 'Мястото е извън обхванатия район.', date: 'Въведи валидна дата (не в миналото и до около една година напред).', meaningful: 'Въведи смислено заглавие.', spam: 'Публикацията беше отхвърлена като възможен спам.', location: 'Мястото не е намерено — постави маркер на картата.' },
};

export async function GET(req) {
  const id = req.nextUrl.searchParams.get('id');
  if (id) return NextResponse.json({ event: await getEvent(id) });

  // The map/list does not need descriptions and source links for all rows up
  // front. Keep the public default response unchanged; the homepage opts into
  // this compact view and fetches the full row only when a detail is opened.
  if (req.nextUrl.searchParams.get('view') === 'map') {
    return NextResponse.json({ events: await publishedMapEvents() });
  }
  return NextResponse.json({ events: await publishedEvents() });
}

export async function POST(req) {
  const messages = MESSAGES[req.headers.get('x-okolo-lang')] || MESSAGES.en;
  // Durable per-IP-hash rate limit (the old in-memory Map didn't survive
  // serverless isolation). Anonymous submissions: 5/hour, 15/day per IP,
  // 150/day across everyone (a flood of "valid" entries is itself abuse).
  const rl = await limit(req, 'submit', { perHour: 5, perDay: 15, globalPerDay: 150 });
  if (rl) {
    return NextResponse.json({
      error: messages.limited,
      code: 'RATE_LIMITED',
      rateLimit: {
        action: 'publish', scope: rl.scope === 'global' ? 'service' : 'network', window: rl.window,
        ...(rl.scope === 'global' ? {} : { max: rl.max }), perHour: 5, perDay: 15,
      },
    }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }
  const raw = await req.json();
  // Honeypot: a hidden "website" field humans never see. Bots that fill it get
  // a fake success (no row written) so they don't adapt.
  if (raw.website) return NextResponse.json({ ok: true, id: null });

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
  // Link-pipeline submissions carry the page they were extracted from — keep it
  // as the linkback (facts + source_url doctrine). Only http(s); anything else
  // is dropped rather than trusted.
  let sourceUrl = null;
  if (typeof raw.source_url === 'string') {
    try {
      const u = new URL(raw.source_url.trim());
      if (u.protocol === 'http:' || u.protocol === 'https:') sourceUrl = u.href.slice(0, 500);
    } catch { /* not a URL → no linkback */ }
  }
  const kind = body.kind === 'place' ? 'place' : 'event';
  // Places are evergreen (no date); events still require starts_at.
  if (!body.title || (kind === 'event' && !body.starts_at)) {
    return NextResponse.json({ error: kind === 'place' ? messages.title : messages.titleDate }, { status: 400 });
  }
  // Plausibility: date format + range (nothing far past/future), coords in Austria.
  const problem = submissionProblem(body, kind, viennaNow().slice(0, 10));
  if (problem) {
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
  const strict = !body.photo_path && !sourceUrl;
  const spam = spamReason(body.title, body.description, { strict });
  if (spam) {
    return NextResponse.json({ error: messages.spam }, { status: 422 });
  }

  let lat = body.lat, lng = body.lng, geo_precision = body.geo_precision || 'venue';
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const geo = await geocodeEvent(body);
    if (!geo) return NextResponse.json({ error: messages.location }, { status: 422 });
    ({ lat, lng } = geo);
    geo_precision = geo.geo_precision;
  }

  let ends_at = body.ends_at || null;
  if (ends_at && body.starts_at && ends_at <= body.starts_at) ends_at = null;

  // Same-event-twice check #2: this event may already be on the map (crawled
  // from a different source, or scanned once before). Events only — places
  // are evergreen singletons with no natural "duplicate" concept here.
  if (kind === 'event') {
    const candidate = {
      title: body.title, starts_at: body.starts_at, ends_at, town: body.town || null, lat, lng,
      description: body.description || null, address: body.address || null, venue: body.venue || null,
      is_free: body.is_free ?? null, age_min: body.age_min ?? null, age_max: body.age_max ?? null,
      indoor: body.indoor ?? null, photo_path: body.photo_path || null,
      categories: Array.isArray(body.categories) ? body.categories.slice(0, 3) : [],
    };
    const match = findDuplicate(candidate, await publishedEvents());
    if (match) {
      const patch = mergePlan(match, candidate);
      await updateEventFields(match.id, patch);
      return NextResponse.json({ ok: true, merged: true, id: match.id, lat: match.lat, lng: match.lng });
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
    categories: Array.isArray(body.categories) ? body.categories.slice(0, 3) : [],
    is_free: body.is_free ?? null,
    age_min: body.age_min ?? null,
    age_max: body.age_max ?? null,
    indoor: body.indoor ?? null,
    emoji: body.emoji || '📌',
    photo_path: body.photo_path || null,
    opening_hours: kind === 'place' ? (body.opening_hours ?? null) : null,
    seasonal: kind === 'place' ? (body.seasonal || null) : null,
    // Genuine public submissions: photo scans carry a photo_path, everything
    // else (typed place/event) is a hand-typed community entry. source_name is
    // left null so the detail view renders a localized "community" label.
    src_kind: body.photo_path ? 'user_photo' : sourceUrl ? 'user_link' : 'user_manual',
    source_name: null,
    source_url: sourceUrl,
  });

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
      `Quelle: ${body.photo_path ? 'Poster-Scan' : sourceUrl ? sourceUrl : 'Formular'}`,
      '',
      `Ansehen: ${base}/event/${res.id}`,
      `Entfernen: ${removeUrl}`,
    ].filter(Boolean).join('\n')
  );
  return NextResponse.json({ ok: true, id: res.id, updated: res.updated, lat, lng, geo_precision });
}
