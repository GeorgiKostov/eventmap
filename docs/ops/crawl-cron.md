# Scheduled crawl — GitHub Actions cron

Keeps the map fresh without anyone remembering to run it. The workflow
[`.github/workflows/crawl.yml`](../../.github/workflows/crawl.yml) runs
`node scripts/crawl.mjs` on a schedule.

## What it does

- **Schedule:** **daily at 04:00 UTC** (~06:00 Vienna) — off-peak and polite to
  municipal servers. Daily is the **trigger**, not the per-source cadence: the
  crawl gates each source on its own tier (`active` 2d / `slow` 5d / `dormant` 7d /
  `dead` quarantine 28d), so on any given morning only the sources actually *due* get
  fetched. This is the tiered cadence the weekly version was waiting for —
  aggregators and big-city calendars refresh every other day, sleepy Gemeinden
  weekly, and nobody gets hammered.
  *(Was Thursday-weekly until 2026-07-14. That made the tiering dead code: on a
  7-day trigger every source is past even the 7-day dormant threshold, so all
  1,800 were crawled every Thursday regardless of tier.)*
- **Also on demand:** the `workflow_dispatch` trigger means you can run it any
  time from the repo's **Actions → Scheduled crawl → Run workflow** button.
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

## Cost

**Bottom line: effectively free — under ~$10/month, and likely less.**

### Compute (the GitHub Actions runner) — **$0, but watch the minutes**

- GitHub Actions is **free for 2,000 minutes/month on private repos, unlimited on
  public repos**.
- A daily run only fetches the sources that are *due*, not all 1,800 — so a run is
  much shorter than a full pass (a full pass is ~30–90 min).
- **The one thing to watch:** a brand-new source defaults to `tier='active'`
  (2-day cadence) until it has 3 crawls of yield history, and right now ~1,500 of
  1,578 AT sources are still `active`. Until they settle into `slow`/`dormant`,
  a daily trigger fetches roughly half the catalog every morning. Ballpark
  **~600–1,400 minutes/month** — inside the 2,000 free private-repo allowance, but
  not by a mile, and **$0 regardless if the repo is public**. It falls off on its
  own as tiers demote. If it doesn't, drop the trigger to `0 4 */2 * *`.

### The actual work (LLM extraction) — **~$1–8/month**

This is the only real cost, and the waterfall keeps it tiny. Note it is driven by
**how often pages change**, not by how often we look — so moving from weekly to
daily does *not* multiply it:

- Of ~1,580 Austrian sources, **~930 are GEM2GO/RiS deterministic parsers → $0 per
  page**, and the page-hash check skips unchanged pages for free.
- Only *changed* pages among the ~635 unknown/other sources call the LLM. A page
  that changes once a week costs one extraction a week whether we check it once or
  seven times.
- Gemini Flash-Lite is ~pennies per page (each extraction ≈ 5–15k input tokens).
  Realistically **~1,200 extractions/month** → **roughly $1–8/month**, and a chunk
  may fall inside Gemini's free tier.

### Geocoding — **$0**
Nominatim/Photon are free public services, and every lookup is cached
permanently (`geocache` table), so recrawls almost never re-geocode.

### Database (Supabase) — **$0 for now**
Current free tier: 500 MB. The `events` table is ~18 MB. The scheduled crawl also
keeps the project awake (free-tier Supabase pauses after inactivity), which is a
nice side benefit. Upgrade to Pro ($25/mo) only when storage/bandwidth grows.

### Why it barely grows with scale
Cost tracks **changed unstructured pages**, not source count or country count.
Adding Bulgaria or the USA adds sources but most are structured/unchanged, so the
LLM bill stays flat. "One region at a time" is a demand strategy; supply is cheap
by design.

**Summary table (daily trigger, tiered per-source cadence):**

| Item | Cost/month |
|---|---|
| GitHub Actions runner | $0 (free tier / public repo) |
| LLM extraction (Gemini Flash-Lite) | ~$1–8 |
| Geocoding (Nominatim/Photon, cached) | $0 |
| Supabase (free tier) | $0 |
| **Total** | **~$1–8** |

## Changing the cadence

Two dials, and it matters which one you turn:

1. **The trigger** — the `cron:` line in `.github/workflows/crawl.yml` (UTC).
   Currently daily (`0 4 * * *`). This sets how often we *look*.
2. **The per-source cadence** — `TIER_CADENCE_DAYS` in `scripts/crawl.mjs`
   (`active: 2, slow: 5, dormant: 7, dead: 28`). This sets who is actually *due*
   when we look.

The trigger must always be at least as frequent as the tightest tier, or the tier
is a no-op (the weekly-trigger bug). To make aggregators refresh faster, lower
`active`; don't touch the cron. To crawl more politely overall, raise the tiers.

Because unchanged pages are hash-skipped for free, a tighter cadence mostly just
catches cancellations/changes sooner; it does not multiply cost proportionally.

## Troubleshooting

- **Run fails immediately** → a secret is missing or wrong. Check
  Settings → Secrets; re-copy `DATABASE_URL` exactly from `.env.local` (it must be
  the pooler host `aws-0-…pooler.supabase.com:6543`, password percent-encoded).
- **Run succeeds but 0 events** → likely a source-side change, not the cron. Check
  the log for per-source `! skip` lines. A genuinely empty pass with everything
  unchanged is normal (hash-skips).
- **Timed out at 180 min** → raise `timeout-minutes`, or raise the tier cadences
  in `scripts/crawl.mjs` so fewer sources come due per run.
- **Never run more than one crawl at once from the same machine/IP** (Nominatim
  per-IP limit). The `concurrency` block enforces this in CI; respect it locally too.
