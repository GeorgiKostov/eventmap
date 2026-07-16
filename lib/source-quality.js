import { isForKids } from './kid-cats.js';

// "Community" = user-submitted content — one CLOSED set, shared by the map's
// Community filter (lib/db.js commonFilters) and the trust tiers below. NOT
// "anything not crawled": bulk osm_mined places are not user submissions, and a
// negation would catch them again (tasks/lessons.md 2026-07-14). It lives HERE
// (the trust/provenance module) and lib/db.js imports it, so the dependency
// points one way — db.js already imports rankPick/communityQualityGate, and a
// db↔quality cycle would work under ESM live bindings but break the first time
// either side touches the other at module-evaluation time.
export const COMMUNITY_KINDS = new Set(['user_photo', 'user_manual', 'user_link']);

// How much do we trust an event's ORIGIN — one definition, imported everywhere
// the digest/newsletter ranks or gates events (lib/db.js weekendPicks,
// lib/digest.js buildDigest). Same pattern as lib/kid-cats.js: a single pure
// predicate beats N copies that drift.
//
// George's ask: "rate higher stuff from official sources like linztermine etc,
// not some random shit." Three tiers, used as ONE term in a lexicographic rank
// tuple (see rankPick below) — never added to anything else as a weighted sum
// (tasks/lessons.md, 2026-07-14: an additive score let free+community+precise
// outvote the family lens; the same trap applies to source trust).
//
//   Tier 2 — curated/official aggregators + vetted family publishers. Matched
//            by source_url DOMAIN (suffix match, so subdomains count), with a
//            source_name fallback for adapters whose source_url is just the
//            event's own permalink (no host in common with the publisher).
//   Tier 1 — the official municipal/institutional crawl (src_kind='crawl' and
//            didn't match tier 2). The GEM2GO/RiS/diocese long tail: official,
//            but generic — nobody curated it for "is this interesting".
//   Tier 0 — unvetted: user submissions (lib/db.js COMMUNITY_KINDS), bulk
//            osm_mined places, or anything with no recognizable src_kind.
//
// Higher number = more trusted; rankPick() sorts this DESCENDING.
export const SOURCE_TIERS = { CURATED: 2, OFFICIAL: 1, UNVETTED: 0 };

// Curated/official aggregators + vetted family publishers, by source_url
// hostname (stripped of a leading "www."). Suffix-matched so a subdomain
// (events.wien.gv.at, ooe.kinderfreunde.at) counts as the same publisher.
const CURATED_DOMAINS = [
  'linztermine.at',
  'wien.gv.at',
  'wienxtra.at',
  'familienkarte.at',
  'fridaundfred.at', // FRida & freD (Kindermuseum)
  'kinderfreunde.at',
  'naturfreunde.at',
  'alpenverein.at',
  'kalkalpen.at',
  'donauauen.at',
  'familienbund.at', // ooe.familienbund.at etc — the live source is a SUBDOMAIN of familienbund.at, not "ooefamilienbund.at" (review catch: the wrong entry was silently masked by the /familienbund/i name fallback)
  'mqw.at', // MuseumsQuartier Wien
  'visitsofia.bg',
];

// source_name fallback: several adapters store the EVENT's own permalink as
// source_url (not the publisher's domain), so the domain match above would
// miss a genuinely curated publisher. Match the publisher's name instead.
const CURATED_NAME_PATTERNS = [
  /wienxtra/i,
  /kinderfreunde/i,
  /naturfreunde/i,
  /alpenverein/i,
  /frida/i,
  /familienbund/i,
  /wien erleben/i,
  /linz.?termine/i, // the live source_name is hyphenated "Linz-Termine" (review catch)
];

function hostname(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null; // not a real URL — never throw on bad/legacy data
  }
}

function matchesCuratedDomain(host) {
  if (!host) return false;
  return CURATED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

function matchesCuratedName(name) {
  if (!name) return false;
  return CURATED_NAME_PATTERNS.some((re) => re.test(name));
}

// Pure: reads only fields already present on a weekendPicks row. 2 (best) | 1 | 0.
export function sourceTier(e) {
  if (matchesCuratedDomain(hostname(e?.source_url)) || matchesCuratedName(e?.source_name)) {
    return SOURCE_TIERS.CURATED;
  }
  if (COMMUNITY_KINDS.has(e?.src_kind) || e?.src_kind === 'osm_mined' || !e?.src_kind) {
    return SOURCE_TIERS.UNVETTED;
  }
  // src_kind === 'crawl' (and any other named-but-unrecognized official kind)
  // falls through here — the official-but-generic default.
  return SOURCE_TIERS.OFFICIAL;
}

// The "no random shit" gate: a tier-0 COMMUNITY submission only earns a spot in
// the digest if it reads like a real event, not a placeholder or a driveby —
// venue AND a real description (>=30 chars) AND nobody has reported it. This is
// deliberately narrower than "not reported" alone: a community event with no
// venue and no description is exactly the shape of the "Test event" row that
// headlined the very first digest run (tasks/lessons.md, 2026-07-14). Non-
// community events are never subject to this gate — official/curated sources
// are trusted by tier, not re-vetted field-by-field.
export function communityQualityGate(e) {
  if (!COMMUNITY_KINDS.has(e?.src_kind)) return true;
  // Belt-and-braces: weekendPicks already excludes reported rows in SQL, so
  // this line is unreachable from there — it exists for any FUTURE caller that
  // hands the gate un-filtered rows. Not the active report enforcement.
  if (e?.report_flag) return false;
  if (!e?.venue || !String(e.venue).trim()) return false;
  if (!e?.description || String(e.description).trim().length < 30) return false;
  return true;
}

// The single rank tuple used by weekendPicks. LEXICOGRAPHIC, not additive —
// see the comment on SOURCE_TIERS above and tasks/lessons.md (2026-07-14).
// Order: family fit (product lens, strictly dominant) → source tier → precise
// location → free → interest_count → soonest (caller applies the last tiebreak
// via starts_at; everything here sorts DESCENDING except starts_at).
export function rankPick(e) {
  return [
    isForKids(e) ? 1 : 0,
    sourceTier(e),
    e?.geo_precision === 'venue' || e?.geo_precision === 'address' ? 1 : 0,
    e?.is_free ? 1 : 0,
    Number(e?.interest_count) || 0,
  ];
}
