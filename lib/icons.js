// Category metadata + clean stroke icons (lucide-style, hand-trimmed paths).
// Icons render white on the category color for map pins, or in the category
// color on light chips.
import React from 'react';

export const CATS = {
  family: { color: '#C93A5B' },
  festival: { color: '#D97A2E' },
  market: { color: '#5B8C4A' },
  music: { color: '#7A5CC7' },
  culture: { color: '#3F7CA8' },
  food: { color: '#B8860B' },
  sport: { color: '#2E9C8C' },
  workshop: { color: '#A85CA0' },
};

const P = {
  // users (family)
  family: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  // tent (festival)
  festival: ['M12 4 3 20h18L12 4', 'M12 12l4.5 8', 'M12 12 7.5 20'],
  // shopping basket (market)
  market: ['M5 9h14l-1.5 10a2 2 0 0 1-2 1.7h-7A2 2 0 0 1 6.5 19L5 9', 'M3 9h18', 'M9 9 12 3l3 6', 'M10 13v4', 'M14 13v4'],
  // note (music)
  music: ['M9 18V6l11-2v12', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  // landmark (culture)
  culture: ['M3 21h18', 'M5 21V10', 'M9 21V10', 'M15 21V10', 'M19 21V10', 'M12 3 3 8h18L12 3'],
  // utensils (food)
  food: ['M7 3v7a2 2 0 0 1-2 2 2 2 0 0 1-2-2V3', 'M5 12v9', 'M5 3v5', 'M19 3a4 8 0 0 0-2 7v1h4V3z', 'M19 11v10'],
  // ball (sport)
  sport: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 3a15 15 0 0 1 0 18', 'M12 3a15 15 0 0 0 0 18', 'M3 12h18'],
  // pencil/brush (workshop)
  workshop: ['M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5L17 3z', 'M15 5l4 4'],
};

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
