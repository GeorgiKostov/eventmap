# Consent-first analytics — 2026-09-12

User-authorized portfolio cleanup keeps the existing EU PostHog project 222118
(now **Okolo — Production**, Studio Kostov organization) and its ingestion token.

- Analytics waits for explicit optional consent, with equal reject/accept controls in
  German, English and Bulgarian and a persistent privacy-settings withdrawal control.
- DNT, GPC, automated browsers, internal markers, local/preview hosts and private
  account/newsletter-management routes fail closed. Cross-tab rejection aborts pending work.
- The browser sends only an explicit event allowlist, coarse page type, a small enum
  property allowlist and public numeric listing IDs. No full URL, query, referrer,
  free text, account/subscriber identity, search text or geography is sent.
- A random ID exists only in memory until reload/withdrawal. **Unique counts represent
  page sessions, not people; cross-visit retention and attribution are unavailable.**
- No PostHog SDK runs: no recording, autocapture, surveys, flags or device enrichment.
  The direct EU ingestion request omits credentials and HTTP referrer and disables GeoIP.
- Newsletter confirmation/preferences server capture is disabled. Newsletter permission
  is not analytics permission. Subscriber counts remain available in the operational
  database; a future server analytics design needs separate durable, withdrawable consent.
- Events before consent are discarded, never replayed. Consent-enabled measurements
  undercount usage; do not present them as total reach, verified attendance or all signups.

Transport follows https://posthog.com/docs/api/capture (`/i/v0/e/`, anonymous events).
The privacy notice was updated in all three languages to match this implementation.
Historical dashboards need interpretation changes: old unique-visitor/retention metrics,
UTM/town breakdowns and `newsletter_confirmed` no longer describe this collection contract.

Verification: 9 focused behavioral/contract tests; complete suite 378 passed, 4 existing
HTTP tests skipped without their configured server; production build generated 111 pages.
Browser checked German rejection, English acceptance/reload/withdrawal and Bulgarian copy.
Live deployment and final ingestion result are recorded below when verified.

Recovery note (2026-09-18): production deployment `dpl_4LCvyr8JXBhgBsrh5aze77MpcyUH`
contains this implementation, uploaded from a dirty checkout of `f89e21f`. Its source files
were absent from `main` at `4d91d9e` and were recovered from that deployment before fixing
the map layout. On the map, the persistent settings entry now lives in the actions menu;
the open consent panel sits above the mobile filters and is vertically centred on desktop. Other pages
retain their floating settings entry. No consent or collection rules were changed.
