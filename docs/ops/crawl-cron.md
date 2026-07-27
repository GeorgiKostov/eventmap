# Scheduled crawl — GitHub Actions cron

Keeps the map fresh without anyone remembering to run it. The workflow
[`.github/workflows/crawl.yml`](../../.github/workflows/crawl.yml) runs
`node scripts/crawl.mjs` on a schedule.

## What it does

- **Validation boundary:** scheduled runs refresh **Austria only**. Germany and
  Bulgaria remain published but are paused until demand justifies reopening them.
- **Structured lane:** daily at **04:00 UTC** (~06:00 Vienna). Only sources whose
  last successful route was deterministic (JSON-LD, iCal, CMS adapter, RSS, etc.)
  are eligible. Source tiers still gate the actual cadence (`active` 2d / `slow`
  5d / `dormant` 7d / `dead` quarantine 28d).
- **LLM lane:** Sunday at **04:30 UTC** (~06:30 Vienna). Sources whose last route
  was `llm`, plus new/unknown sources, run through the structured waterfall first
  and then Gemini Flash-Lite if necessary. A source that gains a working parser is
  promoted automatically into the daily structured lane.
- **Spend boundary:** the scheduled crawl receives no Anthropic key, sets
  `EXTRACT_FALLBACK=none`, and allows at most 150 metered text requests per weekly
  run. Billing exhaustion opens a process-wide circuit and leaves all remaining
  sources due rather than retrying them.
- **Also on demand:** **Actions → Scheduled crawl → Run workflow** offers an
  explicit `structured` or `llm` Austria lane.
- **One run at a time:** the `concurrency` group prevents two crawls overlapping.
  This is deliberate — Nominatim (geocoding) rate-limits **per IP, not per host**,
  so two crawls on one runner throttle each other and silently drop geocodes
  (see `tasks/lessons.md`, 2026-07-12). The crawl is one sequential process by design.
- **What a run does:** for every due source (`works=true`, cadence elapsed) it
  fetches the page, skips it for free if the content hash is
  unchanged, else extracts via the waterfall (JSON-LD → iCal → CMS parser → RSS →
  LLM), geocodes (cached), dedups, and upserts. Dead sources are the exception to
  hash/HTTP-cache skipping: once their 28-day quarantine expires, the crawl forces
  a fresh extraction so successful yield can revive them. Past events expire automatically.

## What YOU must do once (manual, ~3 minutes)

The workflow needs two secrets. GitHub encrypts them and masks them in logs; they
are never written to disk.

1. Go to the repo on GitHub → **Settings → Secrets and variables → Actions → New
   repository secret**.
2. Add these two:

   | Secret name | Value | Where to find it |
   |---|---|---|
   | `DATABASE_URL` | the Supabase pooler connection string | copy the exact value from your local `.env.local` |
   | `GEMINI_API_KEY` | the Gemini API key | copy from `.env.local` |

3. That's it. To test immediately without waiting for 04:00 UTC: **Actions →
   Scheduled crawl → Run workflow**. Watch the log; the final line is
   `Crawl done: N events upserted, M expired`.

Optional secrets (only if you change extraction providers — defaults are fine):
`EXTRACT_PROVIDER`, `EXTRACT_MODEL`, `GEMINI_MODEL`, `XAI_API_KEY`, `XAI_MODEL`.
Do **not** add `ANTHROPIC_API_KEY` to the crawl job. The weekly digest workflow
receives that secret separately for Sonnet copy.

## Cost

**Bottom line: deterministic refreshes are free; the paid lane is Austria-only,
weekly, Gemini-only, prepaid, and hard-capped at 150 requests per run.**

### Compute (the GitHub Actions runner) — **$0, but watch the minutes**

- GitHub Actions is **free for 2,000 minutes/month on private repos, unlimited on
  public repos**.
- A daily run only fetches due structured Austrian sources — so a run is
  much shorter than a full pass (a full pass is ~30–90 min).
- **The one thing to watch:** a brand-new source defaults to `tier='active'`
  (2-day cadence) until it has 3 crawls of yield history. The daily lane currently
  has about 888 known structured Austrian sources; GitHub minutes should fall as
  those sources settle into `slow`/`dormant`.

### The actual work (LLM extraction)

This is the only metered crawl cost:

- Production currently has 641 known Austrian LLM sources. They are eligible only
  on Sunday; stable pages still hash/HTTP-cache skip before model extraction.
- Gemini Flash-Lite is the only scheduled provider. Claude Haiku is not a fallback.
- `MAX_LLM_CALLS=150` is a request ceiling, not a target. A run that reaches it
  leaves the untouched tail due for the next weekly pass.
- Gemini prepayment is also a provider-side hard stop. A depleted balance is
  treated as terminal for the run, not as a transient 429 to retry.

### Geocoding — **$0**
Nominatim/Photon are free public services, and every lookup is cached
permanently (`geocache` table), so recrawls almost never re-geocode.

### Database (Supabase) — **$0 for now**
Current free tier: 500 MB. The `events` table is ~18 MB. The scheduled crawl also
keeps the project awake (free-tier Supabase pauses after inactivity), which is a
nice side benefit. Upgrade to Pro ($25/mo) only when storage/bandwidth grows.

### Why it barely grows with scale
Cost tracks changed unstructured Austrian pages, bounded again by the weekly call
ceiling. Paused countries add no scheduled fetch or model cost.

**Summary table (split validation-phase schedule):**

| Item | Cost/month |
|---|---|
| GitHub Actions runner | $0 (free tier / public repo) |
| LLM extraction (Gemini Flash-Lite) | prepaid, ≤150 requests/week |
| Geocoding (Nominatim/Photon, cached) | $0 |
| Supabase (free tier) | $0 |
| **Total** | **bounded by Gemini prepayment + request ceiling** |

## Changing the cadence

Two dials, and it matters which one you turn:

1. **The triggers** — the `cron:` lines in `.github/workflows/crawl.yml` (UTC):
   daily structured (`0 4 * * *`) and weekly LLM (`30 4 * * 0`).
2. **The per-source cadence** — `TIER_CADENCE_DAYS` in `scripts/crawl.mjs`
   (`active: 2, slow: 5, dormant: 7, dead: 28`). This sets who is actually *due*
   when we look.

The structured trigger must be at least as frequent as the tightest tier, or that
tier becomes a no-op. The LLM lane is intentionally weekly regardless of source
tier; this trades freshness outside the deterministic supply for a hard validation-
phase cost boundary.

## Troubleshooting

- **Run fails immediately** → a secret is missing or wrong. Check
  Settings → Secrets; re-copy `DATABASE_URL` exactly from `.env.local` (it must be
  the pooler host `aws-0-…pooler.supabase.com:6543`, password percent-encoded).
- **Weekly LLM run stops immediately** → check Gemini prepayment. The log names
  `provider billing quota exhausted`; remaining sources stay due.
- **Weekly LLM run stops at 150 calls** → expected circuit breaker. The log names
  `run call budget exhausted`; raise the ceiling only as an explicit cost decision.
- **Run succeeds but 0 events** → likely a source-side change, not the cron. Check
  the log for per-source `! skip` lines. A genuinely empty pass with everything
  unchanged is normal (hash-skips).
- **Timed out at 180 min** → raise `timeout-minutes`, or raise the tier cadences
  in `scripts/crawl.mjs` so fewer sources come due per run.
- **Never run more than one crawl at once from the same machine/IP** (Nominatim
  per-IP limit). The `concurrency` block enforces this in CI; respect it locally too.
