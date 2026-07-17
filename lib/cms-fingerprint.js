// Shared CMS-fingerprint markers — HTML signatures that identify which
// crawl.mjs adapter (if any) a source's listing page should route through.
// Extracted 2026-07-16 from scripts/probe-sources.mjs (which fingerprinted
// from URL patterns and a first HTML fetch when discovering NEW municipalities)
// so scripts/fingerprint-sources.mjs (which re-fingerprints ALREADY-registered
// sources currently stuck on the LLM route) doesn't hand-roll a second copy of
// the same markers. Both scripts import from here; probe-sources.mjs no longer
// defines its own copies.
//
// IMPORTANT: this module only recognizes cms values scripts/crawl.mjs actually
// routes through a deterministic adapter (see ROUTABLE_CMS below). Anything
// else recognizable (plain TYPO3, Joomla jevents, WordPress event plugins,
// Contao, Drupal, Wix, ...) is a candidate for a FUTURE adapter, not something
// to tag onto `sources.cms` today — see ADAPTER_CANDIDATES.

// cms values scripts/crawl.mjs actually gates a parser on (tryStructuredExtraction,
// ~lines 663-905) plus the naturfreunde special case (line 905). Kept as the
// single source of truth for "is this cms value routable" so a proposal never
// invents a value the crawler wouldn't act on.
export const ROUTABLE_CMS = new Set([
  'wien-erleben', 'gem2go', 'siteswift', 'kalkalpen', 'dvv',
  'sitepark-ical', 'typo3-hwveranstaltung', 'kinderfreunde',
  'wordpress-ical', 'naturfreunde',
]);

// --- CMS fingerprint (heuristics originally lifted from scripts/crawl.mjs's
// GEM2GO waterfall comments; extended here with the other cms-gated adapters'
// own markup signatures so the sweep can recognize any of them generically,
// not just gem2go). First match wins; order matters only where markers could
// theoretically overlap (they don't, in practice — each vendor's markup is
// distinctive). ---
export function fingerprintCms(html, url) {
  // GEM2GO (a.k.a. "RIS" in some legacy classifications — verified 2026-07-16
  // that cms='ris'-tagged sources render the identical `veranstaltungcmsliste`
  // container and `ris_table`/`td_va` markup as cms='gem2go' sources; RIS and
  // GEM2GO are the same underlying Kommunalnet platform, not two CMSes. The
  // `/system/web/*.aspx?menuonr=` URL pattern alone is NOT used here anymore —
  // it under-identifies (many gem2go sources use a friendly URL, not the raw
  // aspx one) and isn't a routable cms on its own).
  if (/veranstaltungcmsliste/i.test(html)) return { cms: 'gem2go', signal: 'veranstaltungcmsliste container' };
  if (/rasterListEntry|bemCardContainer|vaCollapsibleListItem/.test(html)) return { cms: 'gem2go', signal: 'gem2go variant marker' };
  if (/class="[^"]*ris_table[^"]*"/.test(html) && /td_va/.test(html)) return { cms: 'gem2go', signal: 'ris-style table (td_va)' };

  // Diocese "siteswift" calendar (6 Austrian dioceses; see lib/siteswift-events.js).
  if (/contentSection middleSection/.test(html) && /modTitle/.test(html)) return { cms: 'siteswift', signal: 'siteswift contentSection/modTitle markup' };
  if (/calHeader/.test(html) && /<article class="item">/.test(html)) return { cms: 'siteswift', signal: 'siteswift calHeader/article.item markup' };

  // DVV Zusatzmodule RSS (Baden-Württemberg municipal feeds; see lib/dvv-events.js).
  // The registered source URL for a dvv source IS the feed itself, so this
  // marker is checked against whatever text was fetched, XML or HTML alike.
  if (/<generator>\s*dvv-Zusatzmodule\b/i.test(html)) return { cms: 'dvv', signal: 'dvv-Zusatzmodule RSS generator tag' };

  // TYPO3 "hwveranstaltung" extension (Stadt Sindelfingen; lib/sindelfingen-events.js).
  // A TER extension key, not a one-off — any TYPO3 site running it emits the
  // same class prefixes, so this generalizes beyond the single known instance.
  if (/hwveranstaltung__record|hw_fe__record/.test(html)) return { cms: 'typo3-hwveranstaltung', signal: 'TYPO3 hwveranstaltung extension markup' };

  // Sitepark RSS + per-event iCal (Stuttgart's official calendar platform).
  if (/sp:out=/.test(html) || /sitepark/i.test(html)) return { cms: 'sitepark-ical', signal: 'Sitepark sp:out / vendor string' };

  // Single-organization adapters, detected by host rather than markup — these
  // are nationwide/citywide publishers with one known domain each, so a host
  // match is exact and cheap. Included for completeness (a not-yet-registered
  // instance under a different URL would still be caught) though no new hits
  // are expected among the AT municipal long tail.
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'kinderfreunde.at' || host.endsWith('.kinderfreunde.at')) return { cms: 'kinderfreunde', signal: 'kinderfreunde.at host' };
    if (host === 'kalkalpen.at' || host.endsWith('.kalkalpen.at')) return { cms: 'kalkalpen', signal: 'kalkalpen.at host' };
    if (host === 'wien.gv.at' || host.endsWith('.wien.gv.at')) return { cms: 'wien-erleben', signal: 'wien.gv.at host' };
    if (host === 'naturfreunde.at' || host.endsWith('.naturfreunde.at')) return { cms: 'naturfreunde', signal: 'naturfreunde.at host' };
  } catch { /* invalid URL, skip host-based checks */ }

  return null;
}

// Generic structured-data presence — these routes are NOT cms-gated in
// crawl.mjs (tryStructuredExtraction tries JSON-LD, MICRODATA, iCal and RSS on
// every source regardless of `cms`), so finding one here on a source currently
// stuck on the LLM route means it should auto-route to $0 on its next crawl —
// worth a re-crawl flag, not a `cms` change.
//
// microdata was added 2026-07-18 alongside lib/microdata-events.js: that rung is
// brand new, so EVERY previously-fingerprinted source predates it and none was
// ever checked. muenchen.de (100), Hänneschen (197) and RheinMain4Family (79)
// were all secretly Microdata on the paid route — this sweep is how we find the
// rest across the whole AT/BG/DE catalog. NB a signal is necessary, not
// sufficient: an itemtype=Event with an empty startDate datetime (Senckenberg)
// still won't extract, so a flagged source must survive a real --url crawl.
export function structuredSignals(html) {
  // Match Event and its subtypes (ChildrensEvent, MusicEvent…), http or https,
  // and — critically — @type nested anywhere in the block (i.e. inside @graph),
  // which the old exact-"Event" regex missed. Same broadening as the JSON-LD and
  // Microdata parsers themselves (isEventType / EVENT_ITEMTYPE).
  const jsonld = /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?"@type"\s*:\s*"[^"]*[Ee]vent"/i.test(html);
  const microdata = /itemtype=["'][^"']*schema\.org\/\w*[Ee]vent\b/i.test(html);
  const ical = /type="text\/calendar"|href="[^"]*\.ics(\?|")|webcal:/i.test(html);
  const rss = /type="application\/(rss|atom)\+xml"/i.test(html);
  return { jsonld, microdata, ical, rss };
}

// Weak confirmation this is actually an event calendar, not an empty/
// administrative page: some 4-digit year plus a German date-ish token, or an
// explicit event-page structured signal.
export function looksLikeCalendar(html) {
  return /\b20\d{2}\b/.test(html) && /veranstalt|termin/i.test(html);
}

// --- recognizable CMSes/plugins with NO crawl.mjs adapter today. Counted into
// the "adapter-candidate clusters" report so the architect can see which 2-3
// new adapters would pay off most, without ever tagging sources.cms with a
// value crawl.mjs wouldn't route (see ROUTABLE_CMS). Each test runs against
// the fetched HTML; first match wins, in roughly build-effort order (a plain
// TYPO3/Joomla/WordPress detection is cheap; the specific-plugin ones need to
// come first so a WP+TEC site isn't bucketed as generic "wordpress"). ---
export const ADAPTER_CANDIDATES = [
  {
    key: 'wp-the-events-calendar',
    label: 'WordPress + The Events Calendar',
    test: (html) => /the-events-calendar|tribe-events|tribe_events/i.test(html),
  },
  {
    key: 'wp-modern-events-calendar',
    label: 'WordPress + Modern Events Calendar',
    test: (html) => /modern-events-calendar|mec-events|mec_events/i.test(html),
  },
  {
    key: 'wp-eventon',
    label: 'WordPress + EventON',
    test: (html) => /eventon|evo_calendar/i.test(html),
  },
  {
    key: 'wordpress-generic',
    label: 'WordPress (no recognized events plugin)',
    test: (html) => /wp-content|wp-includes|<meta name="generator" content="WordPress/i.test(html),
  },
  {
    key: 'joomla-jevents',
    label: 'Joomla + JEvents',
    test: (html) => /com_jevents|icalrepeat\.detail|jevents/i.test(html),
  },
  {
    key: 'joomla-generic',
    label: 'Joomla (no recognized events component)',
    test: (html) => /<meta name="generator" content="Joomla/i.test(html) || /\/components\/com_/i.test(html),
  },
  {
    key: 'typo3-generic',
    label: 'TYPO3 (no recognized events extension)',
    test: (html) => /typo3conf|typo3temp|<meta name="generator" content="TYPO3/i.test(html),
  },
  {
    key: 'contao',
    label: 'Contao',
    test: (html) => /<meta name="generator" content="Contao/i.test(html) || /\bcontao\b/i.test(html),
  },
  {
    key: 'drupal',
    label: 'Drupal',
    test: (html) => /<meta name="generator" content="Drupal/i.test(html) || /\/sites\/default\/files\//i.test(html),
  },
  {
    key: 'wix',
    label: 'Wix',
    test: (html) => /static\.wixstatic\.com|wix-code|X-Wix-/i.test(html),
  },
  {
    key: 'ris-kommunal',
    label: 'RiS-Kommunal (non-GEM2GO instance)',
    test: (html) => /ris-kommunal|riskommunal/i.test(html),
  },
];
export function detectAdapterCandidate(html) {
  for (const c of ADAPTER_CANDIDATES) {
    if (c.test(html)) return c;
  }
  return null;
}

// --- feed-URL discovery: patterns that reveal a machine-readable feed the
// listing page LINKS TO but which crawl.mjs's waterfall didn't fetch (either
// because it isn't a plain <link rel="alternate" type="text/calendar"> the
// generic findIcsLink/findFeedLink helpers already catch, or because it's
// buried in body markup rather than <head>). Extracted from the SAME fetch
// already made for fingerprinting — this never issues an extra request, so it
// stays inside the politeness budget. Dry-run only: the caller records these
// as `feedUrl` candidates in the report, never fetches or writes them here. ---
export function discoverFeedHints(html, baseUrl) {
  const hints = [];
  const abs = (href) => { try { return new URL(href, baseUrl).toString(); } catch { return null; } };

  const wpRest = html.match(/<link rel=["']https:\/\/api\.w\.org\/["'][^>]*href=["']([^"']+)["']/i);
  if (wpRest) hints.push({ type: 'wp-json', url: abs(wpRest[1]) });

  for (const m of html.matchAll(/href=["']([^"']*\.ics(?:\?[^"']*)?)["']/gi)) {
    const url = abs(m[1]);
    if (url) hints.push({ type: 'ics', url });
  }
  for (const m of html.matchAll(/href=["'](webcal:[^"']+)["']/gi)) {
    hints.push({ type: 'webcal', url: m[1] });
  }
  for (const m of html.matchAll(/href=["']([^"']*[?&](?:ical|format)=(?:1|ics)[^"']*)["']/gi)) {
    const url = abs(m[1]);
    if (url) hints.push({ type: 'query-ical', url });
  }
  // dedupe by url
  const seen = new Set();
  return hints.filter((h) => h.url && !seen.has(h.url) && seen.add(h.url));
}

// --- JS-SPA detection: a near-empty server-rendered body plus a client-side
// mount signature means there is no text worth sending to an LLM at all — the
// page must be rendered in a browser to see any content. Recognizing this
// stops the LLM route from being invoked (and billed) on something it could
// never have extracted from. ---
const SPA_MARKERS = /__NEXT_DATA__|__NUXT__|window\.__remixContext|id="root">\s*<\/div>|id="app">\s*<\/div>|ng-version=/i;
export function textLength(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}
export function detectJsSpa(html) {
  if (!SPA_MARKERS.test(html)) return false;
  return textLength(html) < 400; // real content pages run into the thousands
}

// --- bot-block detection: Cloudflare/other challenge pages and 403s waste an
// LLM call on a page that never had event text in the first place. ---
const BLOCK_MARKERS = /just a moment|checking your browser|attention required|cf-chl|cdn-cgi\/challenge-platform|access denied|please verify you are a human/i;
export function detectBlocked(status, html) {
  if (status === 403 || status === 503) return `http ${status}`;
  if (html && BLOCK_MARKERS.test(html)) return 'challenge/bot-block page';
  return null;
}
