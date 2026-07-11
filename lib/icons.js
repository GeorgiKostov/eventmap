// Category metadata + clean stroke icons (lucide-style, hand-trimmed paths).
// Icons render white on the category color for map pins, or in the category
// color on light chips.
import React from 'react';

export const CATS = {
  // -- events --
  family: { color: '#C93A5B' },
  festival: { color: '#D97A2E' },
  market: { color: '#5B8C4A' },
  music: { color: '#7A5CC7' },
  culture: { color: '#3F7CA8' },
  food: { color: '#B8860B' },
  sport: { color: '#2E9C8C' },
  workshop: { color: '#A85CA0' },
  // -- places (evergreen locations, kind='place') --
  playground: { color: '#B5A82E' },
  pool: { color: '#0EA5C4' },
  park: { color: '#4B9B4E' },
  trail: { color: '#7A6350' },
  indoor_play: { color: '#9457C9' },
  museum: { color: '#5B6ABF' },
  zoo: { color: '#C2572F' },
  climbing: { color: '#546E7A' },
};

// Icon-taxonomy pass: replaced icons whose paths read as clutter/dashes at
// 15px pin size (fork tines, globe-seam lines, basket verticals) with bolder,
// fewer-path lucide-style silhouettes. Stroke style stays 2–2.2 width, round caps.
const P = {
  // users (family)
  family: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  // tent (festival)
  festival: ['M12 4 3 20h18L12 4', 'M12 12l4.5 8', 'M12 12 7.5 20'],
  // shopping bag (market) — was a basket with internal verticals that read as dashes
  market: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  // note (music)
  music: ['M9 18V6l11-2v12', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  // landmark (culture)
  culture: ['M3 21h18', 'M5 21V10', 'M9 21V10', 'M15 21V10', 'M19 21V10', 'M12 3 3 8h18L12 3'],
  // fork + knife (food) — was three disconnected fork-tine slivers that read as dashes
  food: ['M7 2v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V2', 'M9 2v20', 'M17 2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Z', 'M17 15v7'],
  // medal/badge (sport) — was a circle with near-vertical arcs that read as globe/dashes
  sport: ['M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12', 'M8.2 13.9 6.5 22l5.5-3.3 5.5 3.3-1.7-8.1'],
  // pencil/brush (workshop)
  workshop: ['M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5L17 3z', 'M15 5l4 4'],
  // swing set (playground)
  playground: ['M4 21 8 4', 'M20 21 16 4', 'M8 4h8', 'M12 10v6'],
  // waves (pool)
  pool: ['M2 9c1 1 2 1.6 4 1.6 3 0 3-2.2 6-2.2 2.7 0 2.7 2.2 5.4 2.2 2 0 3-.6 4-1.6', 'M2 15.4c1 1 2 1.6 4 1.6 3 0 3-2.2 6-2.2 2.7 0 2.7 2.2 5.4 2.2 2 0 3-.6 4-1.6'],
  // balloon tree (park)
  park: ['M12 13a6 6 0 1 0 0-12 6 6 0 0 0 0 12', 'M12 13v8'],
  // signpost (trail)
  trail: ['M5 21V4', 'M5 5h13l-3 3.5 3 3.5H5'],
  // stacked blocks (indoor_play)
  indoor_play: ['M4 13h7v7H4z', 'M13 4h7v7h-7z'],
  // framed picture (museum) — landmark columns are taken by culture
  museum: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21'],
  // paw print (zoo)
  zoo: ['M11 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M20 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z'],
  // mountain (climbing)
  climbing: ['m8 3 4 8 5-5 5 15H2L8 3'],
};

// kind='event' vs kind='place' category subsets (single source of truth for
// filter panels + add-event/add-place forms).
export const EVENT_CATS = ['family', 'festival', 'market', 'music', 'culture', 'food', 'sport', 'workshop'];
export const PLACE_CATS = ['playground', 'pool', 'park', 'trail', 'indoor_play', 'museum', 'zoo', 'climbing'];

export function CatIcon({ cat, size = 15, stroke = 'currentColor', strokeWidth = 2 }) {
  const paths = P[cat] || P.family;
  return React.createElement(
    'svg',
    {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    ...paths.map((d, i) => React.createElement('path', { key: i, d }))
  );
}

// Plain SVG string version for imperative DOM (map pins).
export function catIconSvg(cat, size = 15) {
  const paths = (P[cat] || P.family).map((d) => `<path d="${d}"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
