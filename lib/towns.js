// Town centroids for the Linz/Asten region — geocoding fallback + map anchors.
export const TOWNS = {
  'Linz':             { lat: 48.3069, lng: 14.2858 },
  'Leonding':         { lat: 48.2790, lng: 14.2530 },
  'Traun':            { lat: 48.2200, lng: 14.2370 },
  'Asten':            { lat: 48.2210, lng: 14.4170 },
  'Enns':             { lat: 48.2130, lng: 14.4750 },
  'St. Florian':      { lat: 48.2070, lng: 14.3790 },
  'Ansfelden':        { lat: 48.2090, lng: 14.2900 },
  'Ottensheim':       { lat: 48.3340, lng: 14.1750 },
  'Wilhering':        { lat: 48.3230, lng: 14.1910 },
  'Steyregg':         { lat: 48.2850, lng: 14.3650 },
  'Puchenau':         { lat: 48.3120, lng: 14.2300 },
  'Hörsching':        { lat: 48.2270, lng: 14.1770 },
  'Pucking':          { lat: 48.1870, lng: 14.1900 },
  'St. Marien':       { lat: 48.1550, lng: 14.2620 },
  'Luftenberg':       { lat: 48.2720, lng: 14.3970 },
  'Niederneukirchen': { lat: 48.1560, lng: 14.3540 },
  'Hargelsberg':      { lat: 48.1620, lng: 14.4360 },
};

export const REGION_CENTER = { lat: 48.3000, lng: 14.2900 }; // Linz

// Resolve fuzzy town names ("Linz-Pichling", "Stadt Enns") to a known centroid.
export function townCentroid(town) {
  if (!town) return null;
  const t = town.trim();
  if (TOWNS[t]) return TOWNS[t];
  const hit = Object.keys(TOWNS).find(
    (k) => t.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(t.toLowerCase())
  );
  return hit ? TOWNS[hit] : null;
}
