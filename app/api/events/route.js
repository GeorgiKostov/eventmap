import { NextResponse } from 'next/server';
import { publishedEvents, upsertEvent, updateEventFields } from '../../../lib/db.js';
import { geocodeEvent } from '../../../lib/geocode.js';
import { findDuplicate, mergePlan } from '../../../lib/dedup.js';
import { limit } from '../../../lib/ratelimit.js';
import { spamReason } from '../../../lib/moderation.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ events: await publishedEvents() });
}

export async function POST(req) {
  // Durable per-IP-hash rate limit (the old in-memory Map didn't survive
  // serverless isolation). Anonymous submissions: 10/hour, 30/day.
  const rl = await limit(req, 'submit', { perHour: 10, perDay: 30 });
  if (rl) {
    return NextResponse.json({ error: 'Zu viele Einträge — bitte später wieder.' }, { status: 429 });
  }
  const body = await req.json();
  const kind = body.kind === 'place' ? 'place' : 'event';
  // Places are evergreen (no date); events still require starts_at.
  if (!body.title || (kind === 'event' && !body.starts_at)) {
    return NextResponse.json({ error: kind === 'place' ? 'Titel ist Pflicht.' : 'Titel und Datum sind Pflicht.' }, { status: 400 });
  }
  // Basic spam/abuse guard for anonymous content.
  const spam = spamReason(body.title, body.description);
  if (spam) {
    return NextResponse.json({ error: 'Eintrag wurde als möglicher Spam abgelehnt.' }, { status: 422 });
  }

  let lat = body.lat, lng = body.lng, geo_precision = body.geo_precision || 'venue';
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const geo = await geocodeEvent(body);
    if (!geo) return NextResponse.json({ error: 'Ort nicht gefunden — bitte Pin setzen.' }, { status: 422 });
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
    src_kind: body.photo_path ? 'user_photo' : 'user_manual',
    source_name: null,
    source_url: null,
  });
  return NextResponse.json({ ok: true, id: res.id, updated: res.updated, lat, lng, geo_precision });
}
