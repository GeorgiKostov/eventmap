# Project memory — eventmap (Umkreis)

Session continuity. Update "Where things stand" surgically after meaningful changes.

## One-liner
Location-based event discovery map for the Linz region, Austria — families-first; real events mined
from official municipal sources + AI poster scanning, Google-Maps-style UI. Validation prototype.

## Who
George Kostov (Austria, EU). Solo founder building toward a four-weekend Linz validation test.

## Where things stand (2026-07-10)
- Working prototype, v2 UI, in the `eventmap` repo at `~/Repositories/eventmap`. **Committed but not
  yet pushed** — first `git push -u origin main` needs George's GitHub auth (sandbox lacked it).
- 92 real events seeded (`data/umkreis.db`). Map/filters/detail/scan/JSON-LD/MCP all working; production
  `next build` passes; Vercel-hardened.
- Scan runs on Claude Haiku but needs an API key at runtime; a Gemini Flash-Lite primary is the planned
  cost swap (keep `lib/extract.js` abstraction).
- Name still open — working name **Umkreis**; `.events` international shortlist explored
  (grok / afoot / sidequest / nabo / okolo among the favorites). Decision doc: `docs/decisions/2026-07-10-naming.md`.

## Locked decisions
- Stack: Next.js 15 (plain JS) + MapLibre/OSM + SQLite→Supabase-portable + Claude/Gemini extraction.
- Deploy: Vercel (not GitHub Pages). Production backend = Supabase Postgres+PostGIS (one-file port).
- Data ethics/law: facts + linkback only, never copy prose/images; never fabricate; Vienna-time everywhere.
- Strategy: families-first, one region at a time; B2B2C "publish once, found everywhere" (Google + AI/MCP);
  crawl is the bootstrap, RiS-Kommunal/GEM2GO write-integration is the graduation.

## Open decisions
- Final name (+ register, then rebrand UI/metadata/llms.txt).
- Family = filter or default lens?
- Familienkarte / Land OÖ partnership ask (data + first B2B contact) — not yet attempted.

## Pointers
- Bible: `docs/design/design-doc.md`. Queue: `tasks/todo.md`. Lessons: `tasks/lessons.md`.
  Source quirks: `briefs/mining-brief.md`. Decisions: `docs/decisions/`.
