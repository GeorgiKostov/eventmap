# 2026-08-19 — Inventory-backed city and date SEO pages

Status: adopted locally · Owner: Architect

## Decision

Okolo exposes one crawlable server-rendered discovery hierarchy:

- `/events`
- `/events/<city>`
- `/events/<city>/heute`
- `/events/<city>/wochenende`
- `/events/<city>/kinder`
- `/events/<city>/<year>/<month>`

The first registry is explicit rather than inferred from the search gazetteer: Linz, Wien, Graz,
Salzburg, Innsbruck, Klagenfurt, Villach, Wels, and Sankt Pölten. `/events/vienna` is an ingress
alias that permanently redirects to canonical `/events/wien`.

Six calendar months pre-render from live Postgres data so URLs exist before demand peaks. A moving
12-month window remains valid on demand. Current city and intent pages revalidate hourly; the slower-
moving month pages revalidate every six hours. Fewer than five distinct
listings means `noindex,follow` and sitemap omission, avoiding a scaled set of thin doorway pages.
Filters and arbitrary date combinations do not become crawlable URLs.

`/events/<city>/wochenende` is the permanent live database page. Dated
`/weekend/<city>/<friday>` pages remain curated editorial snapshots and archives, so they are related
but not duplicate surfaces. Individual `/event/<id>` pages remain the only pages carrying Event
rich-result objects; discovery pages use CollectionPage, BreadcrumbList, and URL-only ItemList markup.

## Cost boundary

No Supabase schema or stored data is added. Each page reads at most 80 rows (100 for a month) through
a compact facts-only projection; the measured Linz 80-row payload fell from about 60 KB to 15 KB.
The `/events` subtree explicitly forces static rendering because the shared language-aware root layout
otherwise makes descendants dynamic. ISR means a visitor normally receives Vercel-cached HTML, not a
fresh database query. Sitemap
eligibility for the whole matrix is one capped query, and Next static generation is held to two pages
at once so it stays below the five-connection Supabase pool.

State pages, nationwide verticals, and the wider category matrix are deferred until Search Console
shows which of the first intents earn impressions. This keeps the validation prototype focused and
prevents a speculative crawl-space explosion.

## 2026-08-30 — Linz weekend and trust refinement

The permanent `/events/<city>/wochenende` URL remains the canonical current-weekend landing page.
Its title, H1, description and visible evidence now carry the exact Vienna-local weekend range. For
Linz, currently available picks from the existing frozen editorial digest appear above the complete
inventory; expired or missing pick IDs are omitted rather than replaced with fabricated guidance.
Multi-day picks use their current end date so an ongoing Sunday event is not presented as Friday-only.

City results and nearby results are separate semantic sections. Each page states the bounded result
count, date range, radius, family/free facets, named-source count and last update, and links to a
static sourcing and verification methodology page. City and dated-weekend navigation points directly
to the canonical live weekend URL. This adds evidence and internal-link clarity without a new URL
matrix, database schema, copied publisher prose or additional production query path.

## 2026-08-31 — Evidence hierarchy refinement

The trust evidence remains visible but no longer presents as a dashboard above the event filters.
Every city page keeps its result count, exact date range, radius, date-only freshness and methodology
link in a compact two-line strip. Main city pages also link directly to the family view without
printing a facet count that can legitimately differ after the family query applies its own series
deduplication.

Free counts are omitted from the strip because they are not currently actionable. Named-source
counts now sit beside each displayed city or nearby group, where their denominator is unambiguous,
instead of appearing beside the larger inventory total. This preserves sourcing evidence while
keeping the event list and filters visually primary.
