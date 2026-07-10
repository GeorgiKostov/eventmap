# TODO

Work queue. `[x]` done, `[ ]` open. Newest context at top. Keep surgical — flip/append, don't rewrite.

## Shipped (prototype v1 → v2, 2026-07-10)
- [x] Scaffold Next.js + SQLite (Supabase-portable schema); MapLibre + OSM map.
- [x] Mine 92 real events from linztermine.at, familienkarte.at, erlebe.enns.at, 14 Gemeinde sites
      (agent mining runs → `data/mined/*.json` → `npm run seed`).
- [x] Geocode (Nominatim + cache + town fallback), event expiry, dedup.
- [x] Poster scan: photo → Claude extraction → confirm → publish → live pin.
- [x] Recrawl script (`npm run crawl`) for scheduled refresh.
- [x] UI overhaul: Google-Maps model (desktop sidebar; mobile mini-card → full detail), light theme,
      SVG category icons, date-range picker + more filters, full DE/EN localization.
- [x] AI-readiness: `/event/[id]` JSON-LD pages, sitemap.xml, llms.txt, MCP server (`npm run mcp`).
- [x] Code review pass (12 findings) + fixes; Vercel-hardening (bundled DB → /tmp); `next build` green.
- [x] Moved to `eventmap` repo; agent scaffold + design doc (this structure) added.

## Now / next
- [x] **Supabase Postgres port** — `lib/db.js` on the `postgres` client over the transaction pooler;
      dedicated `umkreis` schema; starts_at/ends_at kept as Vienna-TEXT; booleans/arrays normalized
      to the old SQLite shape so no consumer changed. 95 events imported, map/detail/writes verified live.
- [x] **Scan model swap** — Gemini Flash-Lite primary → Claude Haiku fallback → CLI last, routed in
      `lib/extract.js`. Gemini key wired (routing + build verified; live poster scan not yet fired).
- [ ] **George — push the repo.** First push needs GitHub auth: `git push -u origin main`
      (or `brew install gh && gh auth login`). Never pushed yet (origin/main gone).
- [ ] **Deploy to Vercel.** Set env: `DATABASE_URL` (pooler, required), `GEMINI_API_KEY`,
      `NEXT_PUBLIC_BASE_URL` (absolute sitemap/share links).
- [ ] **Decide the name** and, once registered, rename "Umkreis" in UI + metadata + llms.txt.
      Live availability (2026-07-10): grok/sidequest .events now taken; okolo/afoot/nabo/outings/ambit
      free at $17.99 on `.events`. Shortlist in `docs/decisions/2026-07-10-naming.md`.

## Production backend (mostly done)
- [x] Supabase Postgres port (see above). PostGIS deferred — radius filter is client-side; lat/lng
      doubles suffice. Adding a generated `geography(point)` + GIST index is a one-line future migration.
- [ ] Move `npm run crawl` to a Vercel Cron / GitHub Action (every 2–3 days).
- [ ] Poster uploads → Supabase Storage (currently `/tmp` on serverless, ephemeral).

## Validation (the actual go/no-go — design-doc §11)
- [ ] Run the **four-weekend Linz coverage/retention test**: measure % of good events the big
      aggregators miss, and weekly return rate. This gates everything downstream.
- [ ] Email Familienkarte / Land OÖ for a feed/partnership (cheapest legal data path + first B2B contact).
- [ ] Decide: is "family-friendly" a filter or the default lens?

## Backlog (post-validation, not now)
- [ ] Retention loop: saved favorites + reminders + private/invite events.
- [ ] More extraction fields: ticket links, prices, organizer, recurring schedules, opening hours.
- [ ] New source types: Gemeinde PDF year-calendars, parish newsletters, oeticket/Eventbrite.
- [ ] RiS-Kommunal / GEM2GO write-API/MCP integration (publish-once → no crawl, no double entry).
