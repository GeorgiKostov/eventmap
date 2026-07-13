# Stuttgart event-source survey (40 km pilot)

Researched 2026-07-13. The geographic gate is an exact 40 km great-circle radius from
`48.7758,9.1829`; “Region Stuttgart” branding alone does not establish inclusion. The source
centroid is checked at registration and every event is checked again after geocoding.

## Production-ready, no agreement required

1. **Landeshauptstadt Stuttgart** — the official calendar exposes a children-filtered RSS feed and
   a factual iCal export per event. `scripts/mine-stuttgart-city.mjs` uses those exports, never RSS
   prose or images. The first run found 96 feed items and retained 93 not-yet-ended events, with
   zero failed iCal links. The recurring source is tagged `cms='sitepark-ical'` so it stays on the
   deterministic path rather than invoking the model fallback.
2. **DVV/Komm.ONE municipal calendars** — Esslingen, Ludwigsburg, Böblingen,
   Leinfelden-Echterdingen, and Filderstadt expose aggregate RSS/iCal exports. The repo's `dvv`
   adapter reads hCalendar facts and exact detail links from RSS; descriptions remain null. Their
   wildcard robots rules declare `Crawl-delay: 30`, which the crawler honors per host. The five
   vetted registrations are in `data/catalog/probed-stuttgart-40km.json`. The first aggregate pass
   retained 113 current/future occurrences with zero failed feeds after removing two corrected/exact
   municipal copies: 50 raw items each came from Leinfelden-Echterdingen and Filderstadt, and 5 each
   from Esslingen, Ludwigsburg, and Böblingen (the feed-side limits differ).
3. **Kreativregion Stuttgart** — Wirtschaftsförderung Region Stuttgart publishes a public WordPress
   REST collection at `https://kreativ.region-stuttgart.de/wp-json/wp/v2/dmwpevents` and per-event
   iCal at `https://kreativ.region-stuttgart.de/feed/calendar/?id=<post-id>`. This is a good next
   adapter for regional culture/creative events; use facts and canonical links only.

Other original sources worth gap checks after municipal deduplication: Junges Schloss, Ferien in
Stuttgart, Wilhelma, Sindelfingen, Leonberg, Ditzingen, and original venue calendars. Stuttgart
Tourism carries roughly 2,200 listings and a children filter, but overlaps the city and the TMBW
pool heavily, so it is a later gap source rather than the first ingest.

## High-value APIs requiring George's approval

### TMBW Open Data Pool Baden-Württemberg

This is the closest analogue to the Austrian municipal aggregation route: official tourism and
municipal records, with about 8,500 statewide events reported in July 2025 and export licences
limited to CC0, CC BY, and CC BY-SA. Access is free but requires signing a data-use agreement before
TMBW supplies a project token and documentation. The agreement sets attribution, canonical,
refresh/deletion, credential, and termination obligations. We must not reuse the public viewer's
embedded token. If approved, request access, fetch incrementally at most daily, then apply the local
40 km gate.

### German Tourism Knowledge Graph (DZT/GNTB)

The national knowledge graph now exposes API and MCP access. Its MCP server advertises an
`get_events_by_criteria` tool with date, locality, region, and event-type filters and JSON-LD output.
It requires an API key/request, and TMBW is one of the data contributors. This could become a very
clean broader discovery path, but Stuttgart overlap and licence coverage should be measured before
adding it.

### Eventfrog and Ticketmaster

Eventfrog's public API supports `lat`, `lng`, and `r=40`, but its terms constrain display,
refresh/removal, modification, and redistribution. Ticketmaster Discovery supports Germany and a
native radius filter, but its partner terms impose caching/display/linking obligations and it is
mostly a large-ticketed-event supplement. Both require an explicit legal/product decision before
implementation.

## Platforms not to crawl

- Eventbrite's current terms prohibit scraping and broad reuse outside API/partner arrangements.
- No current public redistributable discovery API was verified for EVENTIM or Rausgegangen.
- Kornwestheim's city-linked Teamup calendar appears to expose a shared key with modification
  semantics and has no verified public read-only iCal. Ask the city for a read-only credential.
- Leonberg's public iCal export sits under a robots-disallowed `/output/` path. Use conservative
  visible-HTML facts or request permission.

Prefer each organizer's or municipality's original listing over scraping these aggregators.

## Operational commands

```bash
# Refresh the official Stuttgart family dataset (read-only network crawl).
node scripts/mine-stuttgart-city.mjs

# Refresh five surrounding official municipal feeds (read-only; no DB write).
node scripts/mine-stuttgart-dvv.mjs

# Review the five DVV registrations; no database write.
node --env-file=.env.local scripts/register-probed.mjs \
  --file data/catalog/probed-stuttgart-40km.json

# After human review, register the sources and run only this region.
node --env-file=.env.local scripts/register-probed.mjs \
  --file data/catalog/probed-stuttgart-40km.json --write
node --env-file=.env.local scripts/crawl.mjs --scope stuttgart-40km
```

Partnership applications and commercial API integration remain intentionally excluded; the reviewed
public-source datasets below were approved for database ingest in the follow-up pass.

## Production ingest — 2026-07-13

The reviewed public-source batch was written to Supabase with no contractual/key-gated sources:

- 93 Landeshauptstadt Stuttgart children-calendar occurrences.
- 113 current/future DVV municipal occurrences after two corrected/exact copies were removed.
- 39 in-scope Kreativregion occurrences; online, out-of-region, and location-unknown records were skipped.
- 221 Stadt Sindelfingen occurrences from all 23 official result pages; one cancelled record was skipped.
- 319 conservative family destinations from OpenStreetMap/Overpass with exact coordinates and OSM
  element linkbacks: destination playground/minigolf, named public pools, notable parks, indoor play,
  family/science/transport museums, zoo/theme/wildlife destinations, and managed climbing facilities.

Supabase verification found exactly 466 German event rows and 319 German place rows, eight source
rows, zero missing/unexpected hashes, zero invalid wall-clock values, zero non-Berlin timezones, and
zero points outside the 40 km radius. Seven already-ended same-day events were immediately expired;
459 events and all 319 places remained published at verification time.
