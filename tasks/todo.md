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
- [ ] **George — push the repo.** First push needs GitHub auth (keychain didn't have it in the
      sandbox): `cd ~/Repositories/eventmap && git push -u origin main` (or `brew install gh && gh auth login`).
- [ ] **George — deploy to Vercel** (read-only demo works out of the box). Optional env:
      `ANTHROPIC_API_KEY` (scan), `NEXT_PUBLIC_BASE_URL` (absolute sitemap/share links).
- [ ] **Decide the name** and, once registered, rename the "Umkreis" branding in UI + metadata +
      llms.txt. Shortlist in `docs/decisions/2026-07-10-naming.md`.
- [ ] **Scan model swap (cost):** add a Gemini Flash-Lite path in `lib/extract.js` as primary,
      Claude Haiku as fallback. Keep the provider abstraction. (`docs/decisions/2026-07-10-scan-model-choice.md`.)

## Production backend (the real unlock — do before the site is "live for writes")
- [ ] Port `lib/db.js` to Supabase Postgres + PostGIS (lat/lng → geography(point), categories → text[],
      keep content_hash unique). One-file port by design.
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
