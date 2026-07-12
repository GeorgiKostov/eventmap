import { NextResponse } from 'next/server';
import { reverseGeocode, reverseGeocodeAddress, forwardGeocode } from '../../../lib/geocode.js';

export const dynamic = 'force-dynamic';

// Address-suggest (autocomplete-as-you-type) uses Photon, not Nominatim:
// Nominatim's usage policy explicitly forbids autocomplete, Photon is built
// for it. Kept self-contained here (not in lib/geocode.js) since it needs no
// DB access — a small in-memory cache is enough and avoids a geocache
// roundtrip per keystroke. Biased toward Linz via lat/lon, filtered to AT.
const SUGGEST_UA = 'umkreis-prototype/0.1 (address suggest; contact: bobojojok@gmail.com)';
const suggestCache = new Map();

function photonLabel(props) {
  const street = [props.street, props.housenumber].filter(Boolean).join(' ');
  const parts = [];
  if (props.name && props.name !== street) parts.push(props.name);
  if (street) parts.push(street);
  const cityLine = [props.postcode, props.city || props.town || props.village]
    .filter(Boolean)
    .join(' ');
  if (cityLine) parts.push(cityLine);
  return parts.join(', ') || props.name || '';
}

async function photonSuggest(q) {
  const key = q.toLowerCase();
  if (suggestCache.has(key)) return suggestCache.get(key);
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=6&lang=de&lat=48.3069&lon=14.2858`;
  let results = [];
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SUGGEST_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      results = (data.features || [])
        .filter((f) => (f.properties?.countrycode || '').toUpperCase() === 'AT')
        .map((f) => ({
          label: photonLabel(f.properties || {}),
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
        }))
        .filter((r) => r.label)
        .slice(0, 6);
    }
  } catch {
    /* Photon unreachable → empty results, still 200 */
  }
  if (suggestCache.size > 500) suggestCache.clear(); // crude bound for long-lived instances
  suggestCache.set(key, results);
  return results;
}

// Reverse geocode (lat/lng) for the top-left "you are near X" pill, forward
// geocode (q) for the "search anywhere" location search, and suggest
// (suggest=1&q=) for address autocomplete. Thin wrapper so the client (which
// can't import lib/geocode.js — it pulls in the DB pool) can reach the
// shared, rate-limited/cached Nominatim helpers plus the Photon suggest path.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('suggest') === '1') {
    const sq = (searchParams.get('q') || '').trim();
    const results = sq.length >= 2 ? await photonSuggest(sq) : [];
    return NextResponse.json({ results });
  }
  const q = searchParams.get('q');
  if (q != null) {
    const country = searchParams.get('country') === 'BG' ? 'BG' : 'AT';
    const result = q.trim().length >= 2 ? await forwardGeocode(q, country) : null;
    return NextResponse.json({ result });
  }
  const lat = parseFloat(searchParams.get('lat'));
  const lng = parseFloat(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
  }
  // reverse=1: fuller {address, town} for the add-flow map picker (drag the
  // main map under the crosshair → fill the location fields). Default reverse
  // stays the short locality label for the "you are near X" pill.
  if (searchParams.get('reverse') === '1') {
    const address = await reverseGeocodeAddress(lat, lng);
    return NextResponse.json({ address });
  }
  const label = await reverseGeocode(lat, lng);
  return NextResponse.json({ label });
}
