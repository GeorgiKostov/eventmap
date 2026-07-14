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
//
// `museum` INCLUDED (George, 2026-07-14: "usually kids go to museums"). He is
// right, and the reasoning generalizes past museums: our places catalogue was
// never a general POI dump — every place in it was MINED as a family place
// (design-doc: "museums, zoos, climbing halls, pools, indoor play, destination
// playgrounds"). So a place being in our DB at all already means somebody judged
// it a family destination; re-litigating that per category in the filter just
// hides our own curation from the people it was curated for. The one adult-ish
// straggler this admits (a car museum) is a fine rainy-day outing anyway, and a
// museum that is genuinely unsuitable is an argument for an explicit
// "not for kids" signal on the row, not for hiding all 408 of them.
//
// `trail` stays OUT, and only for a factual reason: a hiking route can be a
// pram stroll or an alpine scramble, and we do not yet carry the
// family_suitable/sac_scale attribute that tells them apart (15 places —
// negligible either way). Add it the moment that attribute lands.
// See docs/design/big-city-quality.md §3.2.
export const KID_PLACE_CATS = ['playground', 'indoor_play', 'zoo', 'pool', 'climbing', 'park', 'museum'];

// True when this row belongs in a "For kids" view: an explicit age range, the
// `family` category (events), or an inherently child-oriented place type.
export function isForKids(row) {
  if (row.age_min != null || row.age_max != null) return true;
  const cats = row.categories || [];
  return cats.includes('family') || cats.some((c) => KID_PLACE_CATS.includes(c));
}
