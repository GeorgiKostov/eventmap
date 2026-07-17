// Named crawl scopes are a temporary, explicit supply boundary for countries
// where we have not opened national coverage yet. Each entry is a product
// decision, never a silently widened radius: Germany began as Stuttgart-only,
// and Berlin + Munich were added 2026-07-17 on George's explicit call
// ("berlin munich hamburg koln 40km"). Hamburg and Köln are NOT here — they
// have never been discovered, and a scope without a probed catalog behind it
// would claim coverage we don't have.
//
// Centers/radii mirror each catalog's `_meta` (data/catalog/probed-*.json), and
// `sourceRegion` must match the `region` its rows carry, or scopeForSource()
// silently returns null and the scope does nothing.
export const CRAWL_SCOPES = Object.freeze({
  'stuttgart-40km': Object.freeze({
    id: 'stuttgart-40km',
    country: 'DE',
    sourceRegion: 'Stuttgart 40km',
    center: Object.freeze({ lat: 48.7758, lng: 9.1829 }),
    radiusKm: 40,
  }),
  'berlin-40km': Object.freeze({
    id: 'berlin-40km',
    country: 'DE',
    sourceRegion: 'Berlin 40km',
    center: Object.freeze({ lat: 52.52, lng: 13.405 }),
    radiusKm: 40,
  }),
  'munich-40km': Object.freeze({
    id: 'munich-40km',
    country: 'DE',
    sourceRegion: 'München 40km',
    center: Object.freeze({ lat: 48.1351, lng: 11.582 }),
    radiusKm: 40,
  }),
  // Germany's next-biggest metros (George, 2026-07-17: "biggest in Germany… a
  // completed set of AT BG DE"). Hamburg #2, Köln #4 (its 40km ring also reaches
  // Düsseldorf #7 and Bonn), Frankfurt #5 (Rhein-Main: Wiesbaden, Mainz,
  // Offenbach, Darmstadt). Centers are OSM boundary centroids off our own
  // Nominatim, 2026-07-17. Stuttgart already has a scope above.
  'hamburg-40km': Object.freeze({
    id: 'hamburg-40km',
    country: 'DE',
    sourceRegion: 'Hamburg 40km',
    center: Object.freeze({ lat: 53.5502, lng: 10.0013 }),
    radiusKm: 40,
  }),
  'cologne-40km': Object.freeze({
    id: 'cologne-40km',
    country: 'DE',
    sourceRegion: 'Köln 40km',
    center: Object.freeze({ lat: 50.9384, lng: 6.96 }),
    radiusKm: 40,
  }),
  'frankfurt-40km': Object.freeze({
    id: 'frankfurt-40km',
    country: 'DE',
    sourceRegion: 'Frankfurt 40km',
    center: Object.freeze({ lat: 50.1106, lng: 8.6821 }),
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
