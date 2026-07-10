# 2026-07-10 — Deployment: Vercel now, Supabase for production

Status: locked · Owner: Architect

## Decision
- **Host on Vercel**, not GitHub Pages. GitHub Pages is static-only; we need a Node server for the
  API routes (`/api/events`, `/api/scan`), SSR event pages, and the sitemap. A static export would
  kill the data layer, scan, and the AI/SEO pages — the whole point.
- **First live version = read-only demo on Vercel.** The seeded SQLite DB ships in the bundle
  (`outputFileTracingIncludes` in `next.config.mjs`) and is copied to `/tmp` at cold start
  (`resolveDbPath()` in `lib/db.js`). Browsing/map/filters/detail/JSON-LD/sitemap all work with no
  extra config. **Writes (scan/publish) are ephemeral** on serverless.
- **Production backend = Supabase (Postgres + PostGIS).** Mechanical port of `lib/db.js`
  (lat/lng → geography(point), categories TEXT → text[], keep content_hash unique). Then writes
  persist, `npm run crawl` moves to a Vercel Cron / GitHub Action, uploads → Supabase Storage.

## Steps to go live (demo)
1. Import the GitHub repo at vercel.com/new (Next.js auto-detected; defaults fine) → Deploy.
2. Optional env vars (Settings → Environment Variables → redeploy):
   `ANTHROPIC_API_KEY` (or `GEMINI_API_KEY`) for scan; `NEXT_PUBLIC_BASE_URL` for absolute
   sitemap/share links.

## Consequences
- Any write path must stay `/tmp`-safe on serverless until the Supabase port (see `resolveDbPath()`,
  `/api/scan` upload dir).
- The README "Deploying" section is the canonical step-by-step; keep it in sync.
