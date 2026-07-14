import { NextResponse } from 'next/server';
import { reverseGeocode, reverseGeocodeAddress, forwardGeocode } from '../../../lib/geocode.js';
import { limit } from '../../../lib/ratelimit.js';

export const dynamic = 'force-dynamic';

// Generous per-IP cap on the Nominatim-backed paths (forward + reverse). Real
// use is a handful of lookups; this stops one client from flooding the shared
// (per-instance-serialized) Nominatim chain and starving map geocoding. The
// Photon suggest path is cached and autocomplete-frequent, so it's excluded.
const GEO_LIMIT = { perHour: 120, perDay: 600 };

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

// The map covers both AT and BG, so suggest must too — otherwise a Bulgarian
// user typing "Бургас"/"София" gets zero results (the events are on the map but
// unreachable via search). Bias the ranking toward the user's country, but
// accept both countries' hits. Photon has no 'bg' locale → 'en' for BG (it
// still matches Cyrillic queries and returns local Cyrillic names).
const SUGGEST_BIAS = {
  AT: { lat: 48.3069, lon: 14.2858, lang: 'de' }, // Linz
  BG: { lat: 42.6977, lon: 23.3219, lang: 'en' }, // Sofia
};
async function photonSuggest(q, country = 'AT') {
  const bias = SUGGEST_BIAS[country] || SUGGEST_BIAS.AT;
  const key = `${country}|${q.toLowerCase()}`;
  if (suggestCache.has(key)) return suggestCache.get(key);
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=6&lang=${bias.lang}&lat=${bias.lat}&lon=${bias.lon}`;
  let results = [];
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SUGGEST_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      results = (data.features || [])
        .filter((f) => ['AT', 'BG'].includes((f.properties?.countrycode || '').toUpperCase()))
        .map((f) => ({
          label: photonLabel(f.properties || {}),
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          // A locality is a different kind of answer than a street or a shop:
          // the location search ranks localities first, address autocomplete
          // ignores the flag.
          place: (f.properties?.osm_key || '') === 'place',
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
    const country = searchParams.get('country') === 'BG' ? 'BG' : 'AT';
    const results = sq.length >= 2 ? await photonSuggest(sq, country) : [];
    return NextResponse.json({ results });
  }
  const q = searchParams.get('q');
  if (q != null) {
    if (q.trim().length >= 2 && (await limit(req, 'geocode', GEO_LIMIT))) {
      return NextResponse.json({ result: null }, { status: 429 });
    }
    const country = searchParams.get('country') === 'BG' ? 'BG' : 'AT';
    let result = q.trim().length >= 2 ? await forwardGeocode(q, country) : null;
    // The map covers AT+BG; if the requested country has no hit, try the other
    // so a search-field submit ("Бургас", "Sozopol") resolves regardless of the
    // caller's country default. (Autocomplete/suggest already spans both.)
    if (!result && q.trim().length >= 2) result = await forwardGeocode(q, country === 'BG' ? 'AT' : 'BG');
    return NextResponse.json({ result });
  }
  const lat = parseFloat(searchParams.get('lat'));
  const lng = parseFloat(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat/lng required' }, { status: 400 });
  }
  if (await limit(req, 'geocode', GEO_LIMIT)) {
    return NextResponse.json({ address: null, label: null }, { status: 429 });
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
