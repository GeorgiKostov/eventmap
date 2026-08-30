# Partner pilot delivery and scaling runbook

> Status: ready-to-use plan · Owner: George / Okolo · Last updated: 2026-08-30

This is the path from “an organiser is interested” to a reliable first customer deployment. It keeps
the first deal a **managed Okolo pilot**, not a premature self-service B2B platform. The shared
MapLibre/PostGIS product remains the implementation; customer-specific work is configuration, approved
branding, a repeatable programme source and a bounded delivery agreement.

## 1. What can be promised now

For one managed pilot, Okolo can provide:

- one dedicated, mobile-ready partner URL;
- one ready-to-print QR-code asset pointing to that stable URL;
- an optional responsive embed on the partner's event website after confirming that the host site
  permits iframes and agreeing the exact allowed origin, layout and privacy behavior;
- programme, venue, day and time context from an approved official source;
- agreed branding in the page shell and partner surfaces while keeping Okolo's map-pin grammar;
- approved event distribution on the main Okolo map and structured public event pages;
- optional paid visibility only with the existing sponsored label and disclosure controls;
- an agreed anonymous report covering views, filters and referrals to the official source.

Do not promise an organiser portal, self-service theming, ticketing, attendance attribution, offline
maps or a contractual uptime figure before the matching capability and load test exist.

## 2. Information required before quoting the pilot

Record these in one signed scope or written pilot confirmation:

1. Named organiser, delivery owner and technical/data contact.
2. Festival dates, launch date, print/QR deadline and expected peak visitor window.
3. Number of programme points and venues, plus expected peak concurrent visitors if known.
4. A **re-fetchable official source**: feed, iCal, JSON-LD, published Sheet/CSV URL or stable export.
5. Written permission for every logo, colour, artwork and screenshot use.
6. Which Okolo placements are editorial, which are paid, and the corresponding disclosure treatment.
7. Update cadence, correction contact and maximum acceptable time to publish an urgent change.
8. Report fields, reporting date and whether the organiser can provide ticket/source conversion data.
9. Whether Okolo may name the organiser and publish the results as a case study. This permission is
   separate from delivery and is never assumed.
10. Availability, data-processing, accessibility, support and termination expectations.

The programme must remain reachable through `npm run crawl -- --url <source>` with `works=true`.
A one-off emailed spreadsheet is not a refresh path.

## 3. First-customer delivery sequence

### A. Scope and source proof

- Check authorization, terms, robots, licensing and database-right implications before bulk access.
- Register the source and prove the repeatable production crawl path.
- Validate dates against visible official facts, venue coordinates and source linkbacks.
- Create the code-configured partner programme using a stable slug and exact source identity.
- Agree which changes are scheduled updates and which require an urgent manual correction.

### B. Private preview

- Keep the route `noindex` and fail closed until the organiser approves public release.
- Apply approved shell branding; do not turn a logo into a new map-pin meaning.
- Verify partner-only and city-context modes, day filters, source links and selected-event details.
- Test desktop, 390 px mobile, a short desktop viewport, slow network and blocked basemap tiles.
- Freeze a versioned last-known-good programme payload before launch.

### C. Capacity rehearsal

- Run `scripts/load-map.mjs` locally/staging, then against the intended deployment only with explicit
  authorization and `ALLOW_REMOTE_LOAD_TEST=1`.
- Rehearse at several times the customer's expected concurrent traffic.
- Confirm warm partner/map reads are CDN hits and do not open a database session per visitor.
- Test the partner page with OpenFreeMap unavailable: the programme list must remain usable.
- Confirm Supabase and Vercel plan quotas, spending alerts and support route before an SLA is signed.

### D. Launch and evidence

- Remove `noindex` only after approval, confirm canonical URL and publish QR/link destinations.
- If an embed is in scope, allow framing only from the partner's exact approved site origin and
  verify responsive height, keyboard access, referrer policy and cookie-free anonymous use there.
- Start synthetic checks for page HTML, partner payload, source link and basemap style.
- Watch Vercel error/latency/cache metrics and Supabase CPU, connections and slow queries.
- Preserve the last-good programme version throughout the event window.
- Deliver the agreed anonymous report; do not turn a source click into an attendance or sale claim.
- Ask separately for a quote, logo permission and named case-study approval after results exist.

## 4. Performance acceptance budget

These are launch gates, not claims about current contractual capacity:

| Surface | Pilot target |
|---|---|
| Static partner shell | CDN/ISR served; no database read |
| Versioned programme or repeat viewport | at least 95% cache-served during rehearsal |
| Warm API p95 | below 300 ms from the target region |
| Error rate | below 0.5% during the bounded rehearsal |
| Dense pin payload | below 250 KB compressed, or split/hydrate details on demand |
| Database pool | below 70% of available connections during peak rehearsal |
| Database CPU | below 60% sustained during peak rehearsal |
| Recovery | last-good programme can be restored without re-crawling or geocoding |

If the traffic estimate is unknown, do not invent one. Rehearse a conservative band, monitor the
first release and keep the scope explicitly best-effort until measured.

## 5. Current hosted architecture — no self-hosting required

### Event overlay and Vercel

Map requests use zoom-rounded, grid-expanded bounding boxes so visitors in the same area share CDN
keys. Public map data has a short browser lifetime and stale-while-revalidate edge caching; partner
source views receive a longer edge lifetime. Public GETs bypass Supabase Auth refresh. Postgres
returns map rows/cells and their total in one query, while reaction aggregates are restricted to the
bounded pin result.

For the first customer, the existing source-filtered partner map is sufficient. After the first
signed programme, add a versioned `/api/partners/<slug>/programme?v=<version>` snapshot so the normal
guest path can be served entirely from the CDN and the database is used only to publish a new version.

### Supabase Postgres

The transaction pooler remains the serverless connection path. Current read-scaling indexes cover:

- published PostGIS geometry;
- published partner/source identity;
- accent-folded trigram search across title, venue and town;
- existing reaction and highlight lookups.

Before a second independent customer, replace `source_name` as the customer boundary with explicit
`partners`, `programmes` and `programme_events` identifiers plus versioned publication state. That is
the point to add per-partner permissions and reporting dimensions—not before the first managed pilot.

Scale the database in this order:

1. Measure with `pg_stat_statements`, Supabase reports and real route timings.
2. Raise Supabase compute/pooler capacity if CPU or connection thresholds are reached.
3. Publish immutable partner programme snapshots and precompute low-zoom cells.
4. Add targeted expression/composite indexes only for measured slow predicates.
5. Move the event overlay to PostGIS MVT (`ST_AsMVT`) and CDN caching only when ordinary cells/pins no
   longer stay inside the payload/latency budget.
6. Consider a read replica only after cache-first delivery and query/index work are proven insufficient.

### OpenStreetMap, MapLibre and OpenFreeMap

- MapLibre runs in the browser and is already under Okolo's control.
- OpenStreetMap supplies the underlying geographic data and must retain its attribution.
- OpenFreeMap currently serves style, vector tiles, glyphs and sprites directly to the browser, so
  that traffic does not touch Vercel or Supabase.

For the first pilot, keep OpenFreeMap, monitor its style endpoint and preserve the grey-map/working-list
fallback. Self-host only when a contract requires basemap independence, an availability commitment,
offline use or specific data residency. The preferred later path is a versioned Austria/regional
PMTiles archive in S3-compatible object storage behind a CDN; it is operationally smaller than running
a full-planet tile stack. Keep an OpenMapTiles/TileServer deployment for cases that truly require a
custom dynamic tile service.

### Nominatim and Photon (“location stuff”)

Guest use of a published festival map should require **no live geocoding**: resolve and review every
venue before publishing. The public services remain discovery/intake fallbacks:

- Nominatim results are stored in Postgres and public calls are serialized through a database-backed
  global 1.1-second slot across all serverless instances.
- Photon autocomplete is configurable through `PHOTON_URL`, coalesced in each instance, protected by
  a durable global allowance and cached at the CDN. Provider failures are never cached as empty facts.

Do not base an SLA on either public community endpoint. If a customer's admin/intake volume needs live
address search, choose either an EU-compatible managed geocoder with a DPA/SLA or self-host a regional
Photon service. Self-host Nominatim only when batch/forward/reverse volume justifies its larger data and
operations footprint.

## 6. Scale triggers and the next action

| Observed trigger | Next action |
|---|---|
| Cache-served map/programme requests below 90% | inspect key cardinality, cookies and cache headers before adding compute |
| Repeated dense responses hit 800/truncated | narrow partner payload, precompute programme snapshot, then evaluate MVT |
| Search p95 above 150 ms | inspect trigram-index use and query statistics; do not add generic indexes blindly |
| DB connections above 70% | confirm public cache/bypass behavior, then increase pool/compute plan |
| DB CPU above 60% sustained | identify top query, precompute/cache it, then scale compute |
| OpenFreeMap availability becomes contractual | regional PMTiles + CDN, owned style/glyph/sprite URLs and tested fallback |
| Photon/Nominatim is used in the launch-time guest path | pre-resolve venue data; managed/self-host geocoder before SLA |
| Second independent customer signs | explicit partner/programme schema, versioned payloads and per-partner reporting |
| Customer requests self-service | separate product-phase decision: organizer RBAC, moderation, audit and support model |

## 7. Case-study evidence package

Capture a baseline and final evidence pack without invented reach:

- approved event/venue count and update cadence;
- map/page views, partner-only/day filter use and outbound official-source referrals;
- cache hit rate, p95 latency and error rate during the live window;
- corrections received and time to publish them;
- organiser-provided ticket/source conversion only when they can substantiate it;
- one approved quote, screenshots and permission to name/logo the organiser.

The public case study should describe the problem, the repeatable source, what Okolo delivered and the
measured result. Never imply attendance, sales or an official partnership beyond the written evidence.
