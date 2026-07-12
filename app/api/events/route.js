import { NextResponse } from 'next/server';
import { publishedEvents, upsertEvent, updateEventFields } from '../../../lib/db.js';
import { geocodeEvent } from '../../../lib/geocode.js';
import { findDuplicate, mergePlan } from '../../../lib/dedup.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ events: await publishedEvents() });
}

// Anonymous event creation from the scan confirm screen.
// Very light validation + naive in-memory rate limit (prototype-grade).
const hits = new Map();
function rateLimited(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > 10;
}

export async function POST(req) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Zu viele Einträge — bitte später wieder.' }, { status: 429 });
  }
  const body = await req.json();
  const kind = body.kind === 'place' ? 'place' : 'event';
  // Places are evergreen (no date); events still require starts_at.
  if (!body.title || (kind === 'event' && !body.starts_at)) {
    return NextResponse.json({ error: kind === 'place' ? 'Titel ist Pflicht.' : 'Titel und Datum sind Pflicht.' }, { status: 400 });
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
    src_kind: kind === 'place' ? 'manual' : 'user_photo',
    source_name: kind === 'place' ? 'Manuell hinzugefügt' : 'Foto-Upload',
    source_url: null,
  });
  return NextResponse.json({ ok: true, id: res.id, updated: res.updated, lat, lng, geo_precision });
}
