// What makes an event a good WEEKEND PICK — the one editorial policy shared by
// the automatic digest build (lib/db.js weekendPicks → lib/source-quality.js
// rankPick → lib/digest.js splitSections), the desk's Replace button and the
// pre-publish check (scripts/check-picks.mjs). Any AI doing the weekly
// editorial pass reads the same rules in docs/ops/editorial-picks.md and
// starts from this output rather than its own taste.
//
// Why it exists (audit 2026-11-12): the Linz family strand was five Alpenverein
// climbing COURSES two weekends running ("Sicherungsworkshop ab 14",
// Sept→March series), while Theater des Kindes, a Leonding Nutcracker and a
// Kuddelmuddel puppet show sat unpicked at #42–#48. Ranking knew family, source
// trust and precision, but not "is this actually an outing this weekend", and
// its final tiebreak (earliest start) rewarded the OLDEST long-running series.
//
// Title rules only — never inferred from descriptions (same discipline as
// lib/seasonal-events.js). Everything here demotes or flags; only ADMIN_RE
// removes a row from the pool, because those are never public outings.
import { isForKids } from './kid-cats.js';
import { seasonalTheme } from './seasonal-events.js';

// Municipal notices that are not outings at all. Excluded from picks.
export const ADMIN_RE = /grünschnitt|gruenschnitt|altstoff|sperrmüll|problemstoff|müllabfuhr|generalversammlung|jahreshauptversammlung|mitgliederversammlung|vollversammlung|gemeinderat|ausschusssitzung|auszahlung|sparverein|sprechtag|amtstag|parteienverkehr|blutspende|impfaktion/i;

// Courses, trainings, standing groups and services: real, but a subscription
// or a service rather than "something to do this weekend". Always routine.
const ROUTINE_ALWAYS = /lehrgang|ausbildung|aufschulung|fortbildung|weiterbildung|schulung|beratung|sprechstunde|stammtisch|gruppenstunde|trainingsgruppe|wettkampfgruppe|spielgruppe|eltern-kind-gruppe|babytreff|einzelsetting|therapie|selbsthilfe|pflegende angehörige|erste hilfe|notfallkurs|monatstreffen/i;
// Words that are routine only when the row is a SERIES (spans days or is
// numbered): a one-off Saturday kids' workshop is a fine pick, a Sept→Feb
// "Kletterkurs Termin 2" is not.
const ROUTINE_IF_SERIES = /kurs(e)?\b|training|treff\b|treffen\b|yoga|gymnastik|nordic walking|probe\b|übungsabend/i;
const SERIES_MARK = /\btermin \d+\b|\b\d+\. ?einheit\b/i;

// A long-running row is only worth a weekend slot when it is an occasion in
// itself (a Christmas market, a festival, a fair), not a standing programme.
const OCCASION_CATS = new Set(['market', 'festival']);
const SHORT_DAYS = 3;   // Fri–Sun plus a day of slack
const LONG_DAYS = 14;   // beyond this, a row is "running", not "happening"

// Inclusive calendar-day span of a Vienna wall-clock row. String dates only
// (hard rule 3) — UTC noon arithmetic just counts days.
export function spanDays(e) {
  const start = String(e?.starts_at || '').slice(0, 10);
  const end = String(e?.ends_at || e?.starts_at || '').slice(0, 10);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 864e5));
}

export function isAdminNotice(e) {
  return ADMIN_RE.test(e?.title || '');
}

export function isRoutine(e) {
  const title = e?.title || '';
  if (ROUTINE_ALWAYS.test(title) || SERIES_MARK.test(title)) return true;
  return ROUTINE_IF_SERIES.test(title) && spanDays(e) > SHORT_DAYS;
}

// A reader can find it: a venue or at least a town. Rows with neither render
// as a bare title with "?" for a place, whatever the publisher's reputation.
export function hasPlace(e) {
  return Boolean(String(e?.venue || '').trim() || String(e?.town || '').trim());
}

// Enough facts to actually go: a place a reader can find, and a start time
// unless the row is all-day or a multi-day occasion (a market's opening hours).
export function isSpecific(e) {
  const placed = hasPlace(e) && (e?.geo_precision === 'venue' || e?.geo_precision === 'address');
  const timed = String(e?.starts_at || '').includes('T') || Boolean(e?.all_day) || spanDays(e) > SHORT_DAYS;
  return placed && timed;
}

// Within this distance of the edition's centre a pick counts as local. Coarse
// on purpose: a bucket, not a gradient, so it cannot outvote the terms above it.
export const NEAR_KM = 15;
export function isNear(e) {
  return e?.distance_km == null || Number(e.distance_km) <= NEAR_KM;
}

// "Für Familien" means children. isForKids (lib/kid-cats.js) stays the MAP's
// broad predicate — teens' events legitimately belong behind the map's kids
// filter — but a youth programme starting at 14 is not a family outing.
export function isFamilyPick(e) {
  return isForKids(e) && !(Number(e?.age_min) >= 14);
}

// 1 when the row is something happening THIS weekend: a short dated event, a
// seasonal event inside its month guard, or a market/festival. 0 for standing
// programmes and months-long listings.
export function isOccasion(e) {
  if (seasonalTheme(e)) return true;
  if ((e?.categories || []).some((c) => OCCASION_CATS.has(c))) return true;
  return spanDays(e) <= SHORT_DAYS;
}

// Eligibility for the pick pool. Ranking handles everything softer.
export function isPickable(e) {
  return !isAdminNotice(e);
}

// Same-show/series key: "Könige - Junges Theater Liesing" and "… Favoriten",
// "KT Klettertreff Kinder Termin 1/2", "Kultkino X (Stadtgemeinde Y)".
export function titleKey(title) {
  if (!title) return null;
  return String(title).toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(SERIES_MARK, ' ')
    .split(/\s[-–|]\s/)[0]
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim() || null;
}

// Per-issue caps. A strand of five rows from one climbing hall or eight
// Christmas markets is a feed dump, not an editorial pick.
export const CAPS = { venue: 2, theme: 3 };

function venueKey(e) {
  const venue = String(e?.venue || '').trim().toLowerCase();
  // Many adapters store the town as the venue ("Wien"); that is not a venue.
  return venue && venue !== String(e?.town || '').trim().toLowerCase() ? venue : null;
}

// Take up to `n` rows from a RANKED list, skipping repeats of a show, a third
// row from one venue, or a fourth row of one season. Order is preserved. If the
// caps leave the strand short, the skipped rows top it up in rank order — a
// diverse issue is better, but a full one beats a padded-out empty slot.
// `seen` is shared across strands so the caps are per issue.
export function takeDiverse(ranked, n, seen = { titles: new Set(), venues: new Map(), themes: new Map() }) {
  const out = [];
  const skipped = [];
  for (const e of ranked) {
    if (out.length >= n) break;
    const t = titleKey(e.title);
    const v = venueKey(e);
    const th = seasonalTheme(e);
    if ((t && seen.titles.has(t))
      || (v && (seen.venues.get(v) || 0) >= CAPS.venue)
      || (th && (seen.themes.get(th) || 0) >= CAPS.theme)) {
      skipped.push(e);
      continue;
    }
    if (t) seen.titles.add(t);
    if (v) seen.venues.set(v, (seen.venues.get(v) || 0) + 1);
    if (th) seen.themes.set(th, (seen.themes.get(th) || 0) + 1);
    out.push(e);
  }
  for (const e of skipped) {
    if (out.length >= n) break;
    out.push(e);
  }
  // Keep rank order after a top-up.
  const order = new Map(ranked.map((e, i) => [e, i]));
  return out.sort((a, b) => order.get(a) - order.get(b));
}

// Reasons a reviewer (human or AI) should look twice. `block` items should be
// swapped before freezing/publishing; `warn` items need a judgment call.
export function pickFlags(e, { section = null } = {}) {
  const block = [];
  const warn = [];
  if (isAdminNotice(e)) block.push('admin_notice');
  if (isRoutine(e)) block.push('routine_course_or_service');
  if (section === 'family' && !isFamilyPick(e)) block.push('not_for_children');
  if (!isOccasion(e)) warn.push(`long_running_${spanDays(e)}d`);
  if (!hasPlace(e)) warn.push('no_place');
  if (!String(e?.starts_at || '').includes('T') && !e?.all_day && spanDays(e) <= SHORT_DAYS) warn.push('no_time');
  return { block, warn };
}
