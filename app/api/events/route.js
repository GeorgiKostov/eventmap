import { NextResponse } from 'next/server';
import {
  getEvent, publishedEventsPage, mapPins, mapCells, searchEvents, eventsByIds, relatedUpcomingEvents,
} from '../../../lib/db.js';
import { publicUrl } from '../../../lib/public-url.js';
import { publicCacheHeaders } from '../../../lib/public-cache.js';
import { parseSeasonalThemes } from '../../../lib/seasonal-events.js';

export const dynamic = 'force-dynamic';
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

function bad(msg) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

function withCanonicalUrl(event) {
  return event ? { ...event, url: publicUrl(`event/${event.id}`) } : event;
}

function publicJson(body, cache = {}) {
  return NextResponse.json(body, { headers: publicCacheHeaders(cache) });
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
  const themes = parseSeasonalThemes(sp.get('theme'));
  if (!themes) return null;
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
    kind, cats, inout, tod, source, themes,
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
    return publicJson({
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
    return publicJson({ events: (await eventsByIds(ids)).map(withCanonicalUrl) });
  }

  // Global text search — independent of the viewport.
  const q = sp.get('q');
  if (q !== null) {
    const trimmed = q.trim();
    if (!trimmed) return publicJson({ results: [] });
    return publicJson({ results: (await searchEvents(trimmed)).map(withCanonicalUrl) });
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
      return publicJson(
        { mode: 'pins', events, total, truncated },
        { browser: 15, edge: filters.source ? 300 : 60, stale: filters.source ? 900 : 300 },
      );
    }
    // ~64px cells at the given zoom: 360deg / 2^zoom tiles, quartered.
    const cellDeg = 360 / Math.pow(2, Math.round(zoom)) / 4;
    const { cells, total } = await mapCells({ bbox, cellDeg, ...filters });
    if (total <= SPARSE_PINS_MAX) {
      const { events, truncated } = await mapPins({ bbox, ...filters });
      return publicJson(
        { mode: 'pins', events, total, truncated },
        { browser: 15, edge: filters.source ? 300 : 60, stale: filters.source ? 900 : 300 },
      );
    }
    return publicJson(
      { mode: 'cells', cells, total },
      { browser: 15, edge: filters.source ? 300 : 60, stale: filters.source ? 900 : 300 },
    );
  }
  if (view) return bad('unknown view');

  // Public machine-readable catalog: bounded keyset pagination. The old
  // no-param response dumped every event (including internal embeddings)
  // into one request and was the primary database egress multiplier.
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
  return publicJson(
    { events: events.map(withCanonicalUrl), next_cursor: nextCursor },
    { browser: 60, edge: 3600, stale: 86400 },
  );
}
