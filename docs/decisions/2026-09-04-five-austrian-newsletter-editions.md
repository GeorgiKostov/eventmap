# Five Austrian newsletter editions live

> Status: live in production · Date: 2026-09-04
> Supersedes: `2026-09-04-newsletter-editions-waitlist.md` where it names Linz as the sole live edition

## Context

The signup and delivery model now separates live recurring editions from the city launch waitlist.
George approved launching every Austrian city already prepared in the channel registry. A production
inventory check for the current weekend returned ten eligible picks in each catchment before launch.

## Decision

- Linz, Wien, Graz, Salzburg and Innsbruck are live recurring newsletter editions.
- The one live-edition registry drives the map popup, event/weekend-page signup, preferences page,
  admin desk, CLI preparation and delivery, and the scheduled Thursday workflow.
- Thursday preparation regenerates all five editions. The scheduled sender attempts each city
  independently and keeps the existing fresh-snapshot, minimum-picks, unchanged-event,
  per-recipient-ledger and provider-idempotency guards.
- A live city with no confirmed audience is a clean scheduled no-op. Once it has a subscriber, the
  full content/freshness gates apply.
- Existing waitlist rows are never silently converted. A confirmed waitlist subscriber inside a
  newly live catchment receives one ledgered launch notice and must explicitly save the recurring
  edition before entering its digest audience.
- Bulgaria and Germany remain waitlist-only. Their prepared channel rows are not newsletter launches.

## Consequences

Every newsletter email submission now presents the same five Austrian choices plus the launch
waitlist. The weekly preparation cost rises from one to five existing digest-copy generations; the
documented estimate is about one cent per city per week. Social publishing remains manual and only
uses city accounts that actually exist.

## Launch record

- Application commit `f17bd84` is pushed to `main` and live as Vercel production deployment
  `dpl_5xRw6DAFyG5dqBy9upXUXXrFpDhb`, aliased to `okolo.events` and `www.okolo.events`.
- All 310 tests and the 111-page local/Vercel production builds pass. Local and live browser checks
  cover the mobile map signup and a Vienna event-page signup; both render the five editions plus the
  missing-city waitlist, and the event page preselects Wien.
- The one eligible Graz waitlist subscriber's launch notice was accepted by the mail provider. Wien,
  Salzburg and Innsbruck had no eligible waitlist audience. An immediate Graz rerun sent zero and
  skipped the ledgered recipient; the subscriber remains a waitlist row until explicitly opting in.
- The post-launch Vercel production error scan was empty.
