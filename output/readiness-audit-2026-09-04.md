# Okolo production-readiness audit — 4 September 2026

Decision: start exploratory partner conversations, but fix the security blockers before inviting customer use. After those fixes, offer one supervised, bounded managed pilot. Reliable unattended programme integration and contractual capacity are not yet demonstrated.

This audit reviewed main at 843469d, the live public website, current read-only source registry, existing tests, and local reproductions. No fixes, commits, deployment, bulk crawl, paid extraction, subscriber email or customer contact occurred.

## Verified strengths and limits

- All 351 existing tests passed (`node --test test/*.test.*`). `npm run build` passed with Next 15.5.20 and 111 generated pages.
- Live desktop map, German language change, weekend/family filtering and mobile rendering were inspected. The partner offer page was read on mobile. No warning/error logs were captured for the map during the sample.
- Verified by code inspection: account/session checks, protected-event ownership, account-bound intake signatures, public-address DNS pinning for URL extraction, bounded public projections and durable rate limits.
- This was not a penetration-test certification, load test, full accessibility audit, restore drill, or end-to-end authenticated publishing test. Actual PostHog payload history, Search Console numbers, deployment logs, cloud permission configuration and inbox delivery were not inspected.

## Fix before customer use

### 1. High: stored script injection through event JSON-LD

`app/event/[id]/page.js:155` and `app/weekend/[city]/[weekend]/page.js:193` put raw `JSON.stringify` output inside script HTML. An ordinary authenticated contributor can submit entity-encoded closing script tags. Intake sanitization accepts them; `lib/db.js:1279` later decodes them. The result breaks out of the JSON-LD script and runs as same-origin JavaScript when someone views the page. The present CSP has no script-src restriction.

A local reproduction using the actual moderation/normalization/JSON-LD/React SSR functions passed both moderation checks and produced executable script markup. No malicious event was submitted to production.

Action: escape `<` in every data-bearing JSON-LD serialization, cover normalization through SSR in regression tests, and check existing content for the same pattern. HttpOnly cookies do not prevent injected code from making authenticated same-origin requests.

Primary reference: https://nextjs.org/docs/app/guides/json-ld

### 2. High: newsletter bearer tokens enter analytics

`lib/analytics.js:35–45` captures automatic pageviews without URL redaction. Global analytics also runs on `/newsletter/preferences?token=...`; `app/newsletter/preferences/page.js:24` reads that token. It grants subscriber preference changes and unsubscribe without expiry.

A local call to the installed PostHog SDK's event-property generator included the full sample token URL in `$current_url`. This proves the code path; existing production leakage volume remains unknown.

Action: suppress analytics on credential-bearing routes and scrub token/code parameters from all URL and referrer properties. Review stored analytics exposure and determine whether affected tokens need rotation.

### 3. Medium: offline cache stores private pages as the homepage

`public/sw.js:25–33` caches every navigation under `/`. A preferences page, auth callback or error can replace the offline home response. Preferences HTML serializes its bearer token into a client component.

A local VM executing the actual worker reproduced preferences navigation followed by an offline homepage returning the private page. Action: cache a deliberately public offline shell only, reject private/token/error responses, and invalidate the existing cache.

### 4. Dependency advisories need patching and applicability review

Locked and installed Next is 15.5.20. `npm audit --omit=dev --json` returned 11 findings: six high and five moderate. This is an advisory count, not eleven proven production exploits. In particular, a Server Action DoS advisory requires a Server Action; none was found in repository search.

Action: update patched dependencies and review applicable Next image/cache and transitive advisories. The raw audit is temporarily available at `/tmp/okolo-security-audit-deps.json`.

## Fix before promising automatic programme accuracy

### 5. Explicit cancellations and reschedules are not reconciled

`lib/jsonld-events.js:69–83` ignores `eventStatus`; the generic iCal parser at `scripts/crawl.mjs:180` ignores `STATUS`. A local EventCancelled fixture returned an ordinary publishable event. This audit did not establish that a particular cancelled event is currently live.

`lib/db.js:1226–1239` includes the start time in identity. A 15:00 to 17:00 correction produces a new key. The crawler does not reconcile stable publisher IDs to withdraw the old occurrence. Distinct performances must remain separate, so blindly merging same-title records or deleting entries absent from partial feeds is unsafe.

Action: use stable source-event identities, authoritative cancellation handling and explicit correction reconciliation. Test new, changed, cancelled and missing-from-partial-feed cases.

### 6. Main Linz-Termine registry entry still points to August

The live source id 1 is `https://www.linztermine.at/linz-erleben/Linz_erleben_im_August_2026`, last checked August 30 with 67 accepted events. The September refresh still targets a dated August editorial page.

Action: graduate an approved current-calendar route and verify its coverage against the publisher. A successful request to an old monthly page does not demonstrate current coverage.

### 7. Recovery paths can downgrade or strand working sources

- `scripts/crawl.mjs:1136–1139` records fetch failures as noContent. Four failures can move a source to dead tier and a 28-day cadence. Transport failure should not establish an empty source.
- `scripts/crawl.mjs:1162–1164` defers former structured sources when parsing stops working, but keeps the old feed_kind. `lib/crawl-policy.js:28` then excludes them from weekly LLM fallback. Add a durable repair state and operator alert within the approved cost boundary.
- `lib/extract.js:513` limits generic LLM extraction to 25 events and roughly eight weeks. Unchanged-page skipping can prevent later discovery of omitted events. The generic iCal path also does not expand recurrence. Customer feeds need explicit completeness and recurrence semantics.

Live registry context: 1,566 working Austrian sources; the latest check was September 4 at 09:01 UTC, so refresh is running. There are 192 dead-tier sources, 10 blocked sources and 291 with zero last yield. Of 87 sources last checked over 14 days ago, only Schattwald was neither dead nor blocked. Those 87 should not be reported as a general cron outage. Bulgarian/German refresh is intentionally paused.

## Visitor experience

### 8. The family-weekend view contains misleading long-running entries

Live desktop results showed two copies of “Wild Moves Wettkampfgruppe” with different towns/coordinates (ids 31995 and 67511). The latter runs from 2026-01-08 17:00 through 2026-12-24 19:30 and appeared in the September weekend filter as ongoing. The first results also included a long-running private birthday offer. These do not give a parent a trustworthy schedule for this weekend.

The map predicates at `lib/db.js:355–359` and `app/page.js:1834–1840` accept any date overlap. The city SEO query already has narrower overlap bounds. Action: model course occurrences accurately, separate booking offers from dated outings, repair confirmed duplicates and align the appropriate discovery rules across map and SEO.

### 9. Mobile discovery controls and counts need attention

At 390 × 844, the map looks coherent, but list and advanced-filter controls sit beyond the visible horizontal quick-filter row (`app/page.js:3738–3745`). A new visitor may miss the easiest way to browse events. Keep the list entrance visibly available.

`app/page.js:3602` labels the combined event/place total as “Events” in the mobile sheet. The DOM sample contained “17 Events” but four event rows and thirteen places. Show separate counts or an accurate combined label.

The partner offer clearly explains a hosted managed service and links to a fictional demo. Its contact action relies on mailto (`app/partners/partner-showcase.js:53`), so a visible copyable email fallback would help prospects without a configured mail client. This is a usability improvement, not a launch blocker.

## Commercial readiness and recommended sequence

The reported 70,000 Google impressions are useful evidence of search visibility, but do not establish visits, retained families or customer referrals. Confirm the date range and show clicks, CTR, unique landings, outbound source clicks, map engagement and repeat visits beside impressions. Google defines impressions and clicks separately: https://support.google.com/webmasters/answer/7042828?hl=en

The repository's `docs/ops/advertiser-proof.md` already defines this evidence. `tasks/todo.md:291` still records dashboard/access and Search Console exports as outstanding; this audit did not independently verify whether those external tasks have since been completed.

1. Fix script injection, token analytics and private caching; update dependencies and test the specific regressions.
2. Repair the current Linz source and the misleading weekend entries; implement cancellation/reschedule handling for any pilot feed.
3. Agree one organiser, one programme, source/brand permissions, update cadence, correction owner and report definition.
4. Complete the capacity rehearsal and last-good programme recovery described in `docs/ops/partner-pilot-scaling.md` before quoting capacity or uptime. Its load-test task remains open.
5. Invite customer use after those gates. Sell the concrete managed map/QR/embed service and measured referrals; do not promise unattended integrations, ticket sales or guaranteed traffic.

Additional hardening: `app/api/admin/remove/route.js:13` performs removal on a GET carrying the reusable global admin token. Prefer per-event expiring credentials and a deliberate POST so mail scanners cannot trigger moderation. Newsletter signup also lacks a per-recipient/global email-send ceiling; per-IP limits alone do not stop distributed confirmation-email abuse. Neither scenario was exercised against production.
