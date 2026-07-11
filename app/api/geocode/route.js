import { NextResponse } from 'next/server';
import { reverseGeocode, forwardGeocode } from '../../../lib/geocode.js';

export const dynamic = 'force-dynamic';

// Reverse geocode (lat/lng) for the top-left "you are near X" pill, and forward
// geocode (q) for the "search anywhere" location search. Thin wrapper so the
// client (which can't import lib/geocode.js — it pulls in the DB pool) can
// reach the shared, rate-limited/cached Nominatim helpers.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (q != null) {
    const result = q.trim().length >= 2 ? await forwardGeocode(q) : null;
    return NextResponse.json({ result });
  }
  const lat = parseFloat(searchParams.get('lat'));
  const lng = parseFloat(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
  }
  const label = await reverseGeocode(lat, lng);
  return NextResponse.json({ label });
}
