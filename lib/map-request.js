const MAX_BBOX_SPAN = 20;

function cleanCoordinate(value) {
  const rounded = Number(Number(value).toFixed(5));
  return Object.is(rounded, -0) ? 0 : rounded;
}

// Map movements produce almost-identical floating-point bounding boxes. Those
// are disastrous CDN keys: two phones looking at the same neighbourhood miss
// each other's cache by a few metres. Expand the viewport to a zoom-aligned
// grid so nearby requests share one public response while still containing
// every point that was actually visible.
export function canonicalMapViewport(bbox, rawZoom) {
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('bbox must contain four coordinates');
  const zoom = Math.max(0, Math.min(22, Math.round(Number(rawZoom) || 0)));
  // Cap the grid at 0.25° so an already-clamped 19.5° overview never expands
  // beyond the API's 20° safety limit. At neighbourhood zooms the grid follows
  // one quarter of a Web Mercator world tile, matching the server cell tier.
  const grid = Math.min(0.25, 360 / Math.pow(2, zoom) / 4);
  const [west, south, east, north] = bbox.map(Number);
  const quantized = [
    Math.floor(west / grid) * grid,
    Math.floor(south / grid) * grid,
    Math.ceil(east / grid) * grid,
    Math.ceil(north / grid) * grid,
  ];

  const clamped = [
    Math.max(-180, quantized[0]),
    Math.max(-90, quantized[1]),
    Math.min(180, quantized[2]),
    Math.min(90, quantized[3]),
  ];
  // Defensive fallback for a near-boundary floating-point expansion. The
  // caller already clamps around the map centre, so trimming only the expanded
  // margin cannot exclude anything from its original viewport.
  if (clamped[2] - clamped[0] > MAX_BBOX_SPAN) clamped[2] = clamped[0] + MAX_BBOX_SPAN;
  if (clamped[3] - clamped[1] > MAX_BBOX_SPAN) clamped[3] = clamped[1] + MAX_BBOX_SPAN;

  return { bbox: clamped.map(cleanCoordinate), zoom };
}
