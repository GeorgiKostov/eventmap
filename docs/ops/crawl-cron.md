# Scheduled crawl — GitHub Actions cron

Keeps the map fresh without anyone remembering to run it. The workflow
[`.github/workflows/crawl.yml`](../../.github/workflows/crawl.yml) runs
`node scripts/crawl.mjs` on a schedule.

## What it does

- **Schedule:** every **Thursday 04:00 UTC** (~06:00 Vienna) — off-peak and polite
  to municipal servers, and the best day for a *weekly* cadence: organizers enter
  and change events during the work week, and families plan the weekend Wed–Fri,
  so a Thursday run captures the week's updates and lands fresh for the weekend
  with a day of buffer. (Monday is the worst weekly slot — furthest from the next
  weekend, so a mid-week cancellation for "this weekend" wouldn't be caught until
  after the event passed.) Once there are users, the next step is *tiered* cadence
  (daily on aggregators, weekly on villages), which makes the day-of-week moot.
- **Also on demand:** the `workflow_dispatch` trigger means you can run it any
  time from the repo's **Actions → Weekly crawl → Run workflow** button.
- **One run at a time:** the `concurrency` group prevents two crawls overlapping.
  This is deliberate — Nominatim (geocoding) rate-limits **per IP, not per host**,
  so two crawls on one runner throttle each other and silently drop geocodes
  (see `tasks/lessons.md`, 2026-07-12). The crawl is one sequential process by design.
- **What a run does:** for every due source (`works=true`, not `tier='dead'`,
  cadence elapsed) it fetches the page, skips it for free if the content hash is
  unchanged, else extracts via the waterfall (JSON-LD → iCal → CMS parser → RSS →
  LLM), geocodes (cached), dedups, and upserts. Past events expire automatically.

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

3. That's it. To test immediately without waiting for Monday: **Actions → Weekly
   crawl → Run workflow**. Watch the log; the final line is
   `Crawl done: N events upserted, M expired`.

Optional secrets (only if you change extraction providers — defaults are fine):
`EXTRACT_PROVIDER`, `EXTRACT_MODEL`, `GEMINI_MODEL`, `XAI_API_KEY`, `XAI_MODEL`.

## Cost

**Bottom line: effectively free — under ~$10/month, and likely less.**

### Compute (the GitHub Actions runner) — **$0**

- GitHub Actions is **free for 2,000 minutes/month on private repos, unlimited on
  public repos**.
- One weekly full pass is ~30–90 min. At 4–5 runs/month that is **~150–450
  minutes/month** — comfortably inside the free private-repo allowance, and $0 on
  a public repo. (For reference, Actions minutes past the free tier bill at
  ~$0.008/min on Linux, so even a wildly over-budget month would be a few dollars.)

### The actual work (LLM extraction) — **~$1–8/month at weekly cadence**

This is the only real cost, and the waterfall keeps it tiny:

- Of ~1,580 Austrian sources, **~930 are GEM2GO/RiS deterministic parsers → $0 per
  page**, and the page-hash check skips unchanged pages for free.
- Only *changed* pages among the ~635 unknown/other sources call the LLM. On a
  weekly pass, realistically **~100–300 LLM extractions**.
- Gemini Flash-Lite is ~pennies per page (each extraction ≈ 5–15k input tokens).
  ~300 calls/week × ~4 weeks ≈ **~1,200 extractions/month** → **roughly $1–8/month**,
  and a chunk may fall inside Gemini's free tier.

### Geocoding — **$0**
Nominatim/Photon are free public services, and every lookup is cached
permanently (`geocache` table), so recrawls almost never re-geocode.

### Database (Supabase) — **$0 for now**
Current free tier: 500 MB. The `events` table is ~18 MB. The weekly crawl also
keeps the project awake (free-tier Supabase pauses after inactivity), which is a
nice side benefit. Upgrade to Pro ($25/mo) only when storage/bandwidth grows.

### Why it barely grows with scale
Cost tracks **changed unstructured pages**, not source count or country count.
Adding Bulgaria or the USA adds sources but most are structured/unchanged, so the
LLM bill stays flat. "One region at a time" is a demand strategy; supply is cheap
by design.

**Summary table (weekly cadence, Austria):**

| Item | Cost/month |
|---|---|
| GitHub Actions runner | $0 (free tier / public repo) |
| LLM extraction (Gemini Flash-Lite) | ~$1–8 |
| Geocoding (Nominatim/Photon, cached) | $0 |
| Supabase (free tier) | $0 |
| **Total** | **~$1–8** |

## Changing the cadence

Edit the `cron:` line in `.github/workflows/crawl.yml` (UTC, standard cron syntax):

- Every 2 days: `0 4 */2 * *`
- Daily: `0 4 * * *`
- Twice a week (Mon + Thu): `0 4 * * 1,4`

Because unchanged pages are free, a tighter cadence mostly just catches
cancellations/changes sooner; it does not multiply cost proportionally. When
freshness matters more (closer to launch), the natural next step is **tiered
cadence** — a daily pass over the high-yield aggregators + big-city calendars, a
slower pass over sleepy Gemeinden — using the `sources.tier` column that already
exists. Not needed yet at weekly.

## Troubleshooting

- **Run fails immediately** → a secret is missing or wrong. Check
  Settings → Secrets; re-copy `DATABASE_URL` exactly from `.env.local` (it must be
  the pooler host `aws-0-…pooler.supabase.com:6543`, password percent-encoded).
- **Run succeeds but 0 events** → likely a source-side change, not the cron. Check
  the log for per-source `! skip` lines. A genuinely empty pass with everything
  unchanged is normal (hash-skips).
- **Timed out at 180 min** → raise `timeout-minutes`, or the source set has grown
  enough to warrant tiered cadence.
- **Never run more than one crawl at once from the same machine/IP** (Nominatim
  per-IP limit). The `concurrency` block enforces this in CI; respect it locally too.
