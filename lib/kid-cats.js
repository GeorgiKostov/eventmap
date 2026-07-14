// What "For kids" means — ONE definition, imported by both the server filter
// (lib/db.js commonFilters) and the client list filter (app/page.js). They are
// two implementations of the same predicate; when they disagree, the server
// ships rows the client then hides, which looks like data loss to the user.
//
// The bug this fixes: the kids filter was written as
//   age_min IS NOT NULL OR 'family' = ANY(categories)
// before PLACES existed. A place carries `playground`/`pool`/`zoo` — never
// `family`, never an age range — so switching on "For kids" deleted 1,268 of
// 1,269 places from the map, INCLUDING EVERY PLAYGROUND. The one filter a
// parent reaches for was hiding exactly what they came for.
//
// A playground is for children as a matter of fact, not of tagging — mapping
// these categories is a definition, not fabricated data (hard rule 5 intact).
// Deliberately NOT included: `museum` (most are adult venues; a Kindermuseum
// earns the tag through its own events) and `trail` (only once we carry the
// family_suitable/sac_scale attribute — see docs/design/big-city-quality.md).
export const KID_PLACE_CATS = ['playground', 'indoor_play', 'zoo', 'pool', 'climbing', 'park'];

// True when this row belongs in a "For kids" view: an explicit age range, the
// `family` category (events), or an inherently child-oriented place type.
export function isForKids(row) {
  if (row.age_min != null || row.age_max != null) return true;
  const cats = row.categories || [];
  return cats.includes('family') || cats.some((c) => KID_PLACE_CATS.includes(c));
}
