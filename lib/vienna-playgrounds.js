// City of Vienna's licensed WFS point dataset. See the dated authorization
// record; no opening hours, admission prices or age limits are inferred.
export const VIENNA_PLAYGROUNDS_URL = 'https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=2.0.0&typeNames=ogdwien:SPIELPLATZPUNKTOGD&outputFormat=application/json&srsName=EPSG:4326';
export const VIENNA_PLAYGROUNDS_CREDIT = 'Datenquelle: Stadt Wien – data.wien.gv.at';
// Place descriptions are not displayed in map details. Keep the complete
// credit, licence URI and modification notice in the visible source name too.
export const VIENNA_PLAYGROUNDS_SOURCE_NAME = `${VIENNA_PLAYGROUNDS_CREDIT} · bearbeitet · https://creativecommons.org/licenses/by/4.0/`;

const PLAY_TYPES = new Set(['Spielplatz', 'Kleinkinderspielplatz', 'Themenspielplatz', 'Wasserspielplatz']);

export function parseViennaPlaygrounds(data) {
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Vienna playground response is not a GeoJSON FeatureCollection');
  }
  if (Number(data.totalFeatures) > data.features.length) {
    throw new Error('Vienna playground response is incomplete');
  }
  const sites = new Map();
  for (const feature of data.features) {
    const p = feature.properties || {};
    const name = String(p.ANL_NAME || '').trim();
    if (!name || !String(p.TYP_DETAIL || '').split(',').some((t) => PLAY_TYPES.has(t.trim()))) continue;
    const coordinates = feature.geometry?.coordinates;
    const [lng, lat] = Array.isArray(coordinates) ? coordinates : [];
    if (feature.geometry?.type !== 'Point' || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // Reject wrong CRS/axis order and points outside the source municipality.
    if (lat < 48.1 || lat > 48.34 || lng < 16.17 || lng > 16.59) continue;
    const key = name.toLocaleLowerCase('de-AT');
    const rows = sites.get(key) || [];
    rows.push({ name, lat, lng });
    sites.set(key, rows);
  }
  // Multiple playground points sharing a park name cannot be distinguished by
  // the existing title+town place identity. Leave them for location review;
  // never silently collapse distant playgrounds or invent identifying names.
  return [...sites.values()].filter((rows) => rows.length === 1).map(([p]) => ({
    kind: 'place',
    title: /spielplatz/i.test(p.name) ? p.name : `${p.name} – Spielplatz`,
    venue: p.name,
    address: null,
    town: 'Wien',
    lat: p.lat,
    lng: p.lng,
    categories: ['playground'],
    is_free: null,
    indoor: null,
    age_min: null,
    age_max: null,
    opening_hours: null,
    description: `${VIENNA_PLAYGROUNDS_CREDIT}. CC BY 4.0: https://creativecommons.org/licenses/by/4.0/ . Ausgewählte Standortdaten; Bezeichnungen normalisiert.`,
    source_url: VIENNA_PLAYGROUNDS_URL,
  }));
}
