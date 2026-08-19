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
