// Named crawl scopes are a temporary, explicit supply boundary for countries
// where we have not opened national coverage yet. Germany intentionally starts
// with Stuttgart only; adding another German region must be an explicit product
// decision rather than silently widening this radius.
export const CRAWL_SCOPES = Object.freeze({
  'stuttgart-40km': Object.freeze({
    id: 'stuttgart-40km',
    country: 'DE',
    sourceRegion: 'Stuttgart 40km',
    center: Object.freeze({ lat: 48.7758, lng: 9.1829 }),
    radiusKm: 40,
  }),
});

export function crawlScope(id) {
  if (!id) return null;
  return CRAWL_SCOPES[String(id).toLowerCase()] || null;
}

export function scopeFromCatalog(data) {
  const id = data?._meta?.scope || data?.scope || null;
  return id ? crawlScope(id) : null;
}

export function scopeForSource(source) {
  return Object.values(CRAWL_SCOPES).find((scope) => (
    source?.country === scope.country && source?.region === scope.sourceRegion
  )) || null;
}

export function distanceKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return Infinity;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function isWithinCrawlScope(point, scope) {
  return !!scope && distanceKm(scope.center, point) <= scope.radiusKm;
}

// Probed source rows use municipality/coverage centroids to prove that the
// source itself belongs to a named scope before it can be registered. These
// coordinates are catalog metadata, not event coordinates.
export function sourceCatalogPoint(row) {
  const lat = Number(row?.centroid_lat ?? row?.lat);
  const lng = Number(row?.centroid_lng ?? row?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
