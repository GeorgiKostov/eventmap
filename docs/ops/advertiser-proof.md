# Advertiser and publisher proof

> **Live since 2026-08-16.** App instrumentation shipped in `d62396e` and was verified on
> production deployment `dpl_BQuJTXPn1aUytb8RpExyeFfgS5gd`. Clean evidence accumulates from that
> point forward; the new conversion taxonomy is not retroactive.

Repository work is complete. The remaining operator-owned setup—internal-device opt-out, PostHog
dashboard creation, monthly Search Console/channel exports and campaign allow-lists—is tracked at
the top of [`tasks/todo.md`](../../tasks/todo.md).

This is the validation-phase measurement contract for partner conversations. The output is an
internal PostHog dashboard plus a dated PDF/export for a named campaign — not a public publisher
portal and not a promise of ticket sales.

## What Okolo can prove

Use one reporting timezone everywhere: **Europe/Vienna**. Show both the selected period and the
previous equal period. Always state the event IDs, campaign dates, area and paid tier included.

| Question | Definition | Source |
|---|---|---|
| Is Google sending useful visitors? | Unique `event_landing_view` visitors with a search-engine `referring_domain`; break down by event, town, category and referrer. Search Console remains the source of truth for impressions, queries, CTR and position. | PostHog + Search Console |
| Do landings lead to discovery? | Counts and unique visitors for `event_map_open`, `event_recommendation_open`, `event_source_open`, and `newsletter_signup_started`, divided by unique landing visitors. Break map opens down by `placement` (`header`, `hero`, `after_nearby`) before changing the funnel again. | PostHog |
| Do readers subscribe? | `newsletter_confirmed` divided by `newsletter_signup_started` for the same period/source/area. This is an aggregate conversion rate, not a same-person funnel: confirmation may happen on another device. Active confirmed subscriber totals come from the database. | PostHog + Supabase |
| Do people return? | Visitors with activity on at least two distinct Vienna calendar days in 30 days; report overall and by the town/category on `event_landing_view`. Anonymous browser storage means this is a conservative browser-level measure, not a cross-device identity. | PostHog |
| Did a paid placement get exposure? | Unique `sponsored_impression` by event ID and surface. On an event page it means the page loaded; on a weekend page the labelled card entered the viewport; on the map it means the labelled paid result was rendered in the current viewport/filter result set. Report the map number as “rendered results,” not an IAB viewability claim. | PostHog |
| Did the placement create intent/referral? | `sponsored_open` and `sponsored_referral` by event ID/surface, with rates against unique sponsored impressions. A referral is a click to the publisher’s source, not proof that the destination loaded or a ticket was bought. | PostHog |

No event carries a campaign name in public payloads. For each contract, the signed campaign sheet
must define the partner, event IDs, tier, start/end time and surfaces; filter the report with that
allow-list. This avoids leaking commercial notes and prevents unrelated organic traffic from being
credited to a partner.

## Event taxonomy

- `event_landing_view`: SEO event page loaded. Properties: `id`, event `status`, `town`, `category`,
  city `channel`, referring domain and the fixed UTM fields. No full referrer URL is stored.
- `event_map_open`, `event_recommendation_open`, `event_source_open`: meaningful next actions from
  an event landing. IDs and surfaces let the report attribute them without titles or personal data;
  map opens also carry the closed `header`, `hero`, or `after_nearby` placement.
- `weekend_event_open`, `weekend_map_open`: actions from the weekly public page.
- `newsletter_signup_started`: the provider accepted a double-opt-in email. It is not a subscriber.
- `newsletter_confirmed`: the address owner confirmed. Emitted once from the production server;
  email address and token are never sent to PostHog.
- `sponsored_impression`, `sponsored_open`, `sponsored_referral`: gold/Anzeige only. Every event
  includes `id`, `tier: gold`, and `surface`; clicks also state their target.

The existing `$pageview`/`$pageleave` events provide sessions and landing paths. Autocapture and
session recording stay off. PostHog uses anonymous profiles, respects Do Not Track, and receives
nothing from localhost, Vercel previews, WebDriver sessions, or browsers marked internal.

## Dashboard to create

Create one private dashboard named **Partner proof — validation** with these saved insights:

1. Search demand: Search Console clicks and impressions (manual monthly import/export), next to
   PostHog unique organic `event_landing_view` visitors.
2. Landing actions: trends for the four event landing actions above, with conversion rates from
   unique landing visitors and an `event_map_open` breakdown by `placement`.
3. Newsletter: started and confirmed by `source` and `area`, plus aggregate confirmation rate.
4. Retention: weekly new-versus-returning visitors and 30-day return-on-a-different-day rate.
5. Sponsored delivery: unique impressions, opens and referrals by `id` and `surface`, filtered to
   the contract’s event-ID allow-list and exact highlight period.
6. Quality guardrail: archived/disputed landing share, 404 rate from Vercel logs, and frontend/API
   error rate. Traffic is not persuasive if the landing experience is wrong.

Every partner export must carry: generated date/timezone, exact period, definitions above, source
systems, internal/bot exclusions, and the cross-device/attribution caveats. Prefer absolute counts
plus rates; never cherry-pick only CTR.

## Internal traffic and privacy

Open `https://www.okolo.events/?okolo_internal=1` once on every Okolo-operated browser. That browser
will stop sending analytics until it visits `?okolo_internal=0`. Do this before live QA or partner
demos. PostHog event properties must remain factual and non-PII: event IDs, area labels, categories,
surfaces and campaign UTMs only — never email, subscription token, precise user location, or free
text. Search Console and Meta/email-provider exports remain aggregate.

## Minimum evidence bar

Do not sell “viral” from one day of impressions. The first credible proof pack should cover at least
four consecutive weekends and show: search demand, unique landings, downstream action rate,
confirmed newsletter growth, different-day return rate, and the error/404 guardrail. A sponsored
pilot can report delivery earlier, but must be labelled a pilot with its small sample size.
