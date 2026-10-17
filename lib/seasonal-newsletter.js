import { seasonalTheme, seasonalWindow } from './seasonal-events.js';
import { STRINGS } from './i18n.js';
import { CATS } from './icons.js';

const ICONS = {
  christmas_market: '🎄', christmas: '🎁', halloween: '🎃', new_year: '✨',
  valentine: '♥', easter: '🐣', fasching: '🎭',
};

// Use the frozen issue's dates and picks, never today's clock. An archive keeps
// its seasonal treatment, while an ordinary issue gets no seasonal decoration.
export function newsletterSeason(digest) {
  const from = digest.window.from;
  const to = digest.window.to;
  const counts = new Map();
  for (const item of digest.items) {
    const start = item.startsAt?.slice(0, 10);
    if (!start) continue; // Old snapshots without machine dates stay neutral.
    const end = item.endsAt?.slice(0, 10) || start;
    const overlapFrom = start > from ? start : from;
    const overlapTo = end < to ? end : to;
    if (overlapFrom > overlapTo) continue;
    const theme = seasonalTheme({ title: item.title, starts_at: item.startsAt });
    if (!theme) continue;
    const season = seasonalWindow(theme, overlapFrom) || seasonalWindow(theme, overlapTo);
    if (!season || season.from > overlapTo || season.to < overlapFrom) continue;
    counts.set(theme, (counts.get(theme) || 0) + 1);
  }
  // Most represented theme; ties follow the editor's pick order.
  const theme = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!theme) return null;
  return {
    theme,
    label: (STRINGS[digest.channel.lang] || STRINGS.en).holidays[theme],
    color: CATS[theme].color,
    icon: ICONS[theme],
  };
}
