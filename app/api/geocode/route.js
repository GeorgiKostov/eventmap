import { NextResponse } from 'next/server';
import { reverseGeocode, reverseGeocodeAddress, forwardGeocode } from '../../../lib/geocode.js';
import { limit } from '../../../lib/ratelimit.js';
import { publicCacheHeaders } from '../../../lib/public-cache.js';

export const dynamic = 'force-dynamic';

// Generous per-IP cap on the Nominatim-backed paths (forward + reverse). Real
// use is a handful of lookups; this stops one client from flooding the shared
// (per-instance-serialized) Nominatim chain and starving map geocoding. The
// Photon suggest path is cached and autocomplete-frequent, so it's excluded.
const GEO_LIMIT = { perHour: 120, perDay: 600 };
const SUGGEST_LIMIT = { perHour: 180, perDay: 1000, globalPerDay: 5000 };

// Address-suggest (autocomplete-as-you-type) uses Photon, not Nominatim:
// Nominatim's usage policy explicitly forbids autocomplete, Photon is built
// for it. Kept self-contained here (not in lib/geocode.js) since it needs no
// DB access — a small in-memory cache is enough and avoids a geocache
// roundtrip per keystroke. Ranking is biased toward the caller's country;
// hits from any served country are accepted.
const SUGGEST_UA = 'Okolo/1.0 (+https://www.okolo.events; contact: hello@okolo.events)';
const PHOTON_BASE = (process.env.PHOTON_URL || 'https://photon.komoot.io').replace(/\/$/, '');
const SUGGEST_CACHE_MS = 24 * 60 * 60 * 1000;
const suggestCache = new Map();
const suggestInFlight = new Map();

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

// The map covers AT, BG and DE, so suggest must too — otherwise a user typing
// "Бургас"/"София"/"Potsdam" gets zero results (the events are on the map but
// unreachable via search). Bias the ranking toward the user's country, but
// accept every served country's hits. Photon has no 'bg' locale → 'en' for BG
// (it still matches Cyrillic queries and returns local Cyrillic names).
const SUGGEST_BIAS = {
  AT: { lat: 48.3069, lon: 14.2858, lang: 'de' }, // Linz
  BG: { lat: 42.6977, lon: 23.3219, lang: 'en' }, // Sofia
  DE: { lat: 52.5174, lon: 13.3951, lang: 'de' }, // Berlin
};

// The countries this API will answer for — ONE closed set, derived from the
// bias table so the two can't drift. Every AT/BG pair in this file used to be
// spelled out separately (a ['AT','BG'] filter, two `=== 'BG' ? 'BG' : 'AT'`
// parses, and a binary `? 'AT' : 'BG'` fallback flip), which meant adding a
// third country silently did nothing: DE hits were filtered out of suggest and
// the fallback could never reach DE. Hard rule 8 — a city we crawl but nobody
// can type their way to is invisible.
const SERVICE_COUNTRIES = Object.keys(SUGGEST_BIAS);
const requestedCountry = (raw) => {
  const c = String(raw || '').toUpperCase();
  return SERVICE_COUNTRIES.includes(c) ? c : 'AT';
};

async function photonSuggest(q, country = 'AT', reserveSlot) {
  const bias = SUGGEST_BIAS[country] || SUGGEST_BIAS.AT;
  const key = `${country}|${q.toLowerCase()}`;
  const cached = suggestCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { results: cached.results, cacheable: true, limited: null };
  if (cached) suggestCache.delete(key);
  if (suggestInFlight.has(key)) return suggestInFlight.get(key);

  const pending = (async () => {
    const limited = reserveSlot ? await reserveSlot() : null;
    if (limited) return { results: [], cacheable: false, limited };
    const url = `${PHOTON_BASE}/api?q=${encodeURIComponent(q)}&limit=6&lang=${bias.lang}&lat=${bias.lat}&lon=${bias.lon}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': SUGGEST_UA },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { results: [], cacheable: false, limited: null };
      const data = await res.json();
      const results = (data.features || [])
        .filter((f) => SERVICE_COUNTRIES.includes((f.properties?.countrycode || '').toUpperCase()))
        .map((f) => ({
          label: photonLabel(f.properties || {}),
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          country: (f.properties?.countrycode || '').toUpperCase(),
          // A locality is a different kind of answer than a street or a shop:
          // the location search ranks localities first, address autocomplete
          // ignores the flag.
          place: (f.properties?.osm_key || '') === 'place',
        }))
        .filter((r) => r.label)
        .slice(0, 6);
      if (suggestCache.size >= 500) suggestCache.delete(suggestCache.keys().next().value);
      suggestCache.set(key, { results, expiresAt: Date.now() + SUGGEST_CACHE_MS });
      return { results, cacheable: true, limited: null };
    } catch {
      // A provider failure is not a real empty result and must not be cached —
      // otherwise one outage becomes a day-long false negative at the CDN.
      return { results: [], cacheable: false, limited: null };
    }
  })();
  suggestInFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    suggestInFlight.delete(key);
  }
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
    const country = requestedCountry(searchParams.get('country'));
    const outcome = sq.length >= 2
      ? await photonSuggest(sq, country, () => limit(req, 'geocode_suggest', SUGGEST_LIMIT))
      : { results: [], cacheable: true, limited: null };
    if (outcome.limited) {
      return NextResponse.json(
        { results: [] },
        { status: 429, headers: { 'Retry-After': String(outcome.limited.retryAfter) } },
      );
    }
    return NextResponse.json(
      { results: outcome.results },
      { headers: outcome.cacheable
        ? publicCacheHeaders({ browser: 300, edge: 86400, stale: 604800 })
        : { 'Cache-Control': 'no-store' } },
    );
  }
  const q = searchParams.get('q');
  if (q != null) {
    if (q.trim().length >= 2 && (await limit(req, 'geocode', GEO_LIMIT))) {
      return NextResponse.json({ result: null }, { status: 429 });
    }
    const country = requestedCountry(searchParams.get('country'));
    let result = q.trim().length >= 2 ? await forwardGeocode(q, country) : null;
    let resolvedCountry = result ? country : null;
    // If the caller's country has no hit, try the others, so a search-field
    // submit ("Бургас", "Sozopol", "Potsdam") resolves regardless of the
    // caller's default. (Autocomplete/suggest already spans all of them.)
    // Worst case is one lookup per served country — bounded, cached, and only
    // on a miss; the places.js gazetteer answers the common cases first.
    if (!result && q.trim().length >= 2) {
      for (const alt of SERVICE_COUNTRIES) {
        if (alt === country) continue;
        result = await forwardGeocode(q, alt);
        if (result) {
          resolvedCountry = alt;
          break;
        }
      }
    }
    return NextResponse.json(
      { result: result ? { ...result, country: resolvedCountry } : null },
      { headers: publicCacheHeaders({ browser: 60, edge: 300, stale: 1800 }) },
    );
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
