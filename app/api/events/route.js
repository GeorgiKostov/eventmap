import { NextResponse } from 'next/server';
import { publishedEvents, upsertEvent } from '../../../lib/db.js';
import { geocodeEvent } from '../../../lib/geocode.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ events: publishedEvents() });
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
  if (!body.title || !body.starts_at) {
    return NextResponse.json({ error: 'Titel und Datum sind Pflicht.' }, { status: 400 });
  }

  let lat = body.lat, lng = body.lng, geo_precision = 'venue';
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    const geo = await geocodeEvent(body);
    if (!geo) return NextResponse.json({ error: 'Ort nicht gefunden — bitte Pin setzen.' }, { status: 422 });
    ({ lat, lng } = geo);
    geo_precision = geo.geo_precision;
  }

  let ends_at = body.ends_at || null;
  if (ends_at && ends_at <= body.starts_at) ends_at = null;

  const res = upsertEvent({
    title: String(body.title).slice(0, 200),
    description: body.description ? String(body.description).slice(0, 500) : null,
    starts_at: body.starts_at,
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
    src_kind: 'user_photo',
    source_name: 'Foto-Upload',
    source_url: null,
  });
  return NextResponse.json({ ok: true, id: res.id, updated: res.updated });
}
