# Local crawl box — setup runbook (Ryzen / 64 GB)

**Goal:** run the whole extraction stack on George's PC — the crawler, the location-enrichment
second hop, and (the actual reason the box matters) **self-hosted Nominatim + Photon**, which
deletes the 1.1 s/lookup public-instance gate that caps every backfill. Companion docs:
[`docs/architecture/eu-scale-extraction.md`](../architecture/eu-scale-extraction.md) (why this
architecture), [`docs/design/data-pipeline.md`](../design/data-pipeline.md) (what the pipeline does),
[`docs/design/big-city-quality.md`](../design/big-city-quality.md) (the enrichment ladder).

Everything below assumes the box reaches the internet and can hold ~150 GB (country extracts) or
~1 TB NVMe free (full Europe, later).

## 0. OS layer — Windows walkthrough (George's box runs Windows)

Nobody can install this remotely — but every step below is copy-paste, and once the repo is
cloned you can open a Claude Code session **on the box itself** and let it drive the rest
(`npm i -g @anthropic-ai/claude-code`, sign in, say "run docs/ops/local-box-setup.md").

1. **WSL2 + Ubuntu** (admin PowerShell):
   ```powershell
   wsl --install -d Ubuntu-24.04     # reboot when prompted, set a unix user
   ```
2. **WSL config** — create `C:\Users\<you>\.wslconfig`:
   ```ini
   [wsl2]
   memory=48GB
   processors=12
   swap=16GB
   ```
   Then `wsl --shutdown` once so it applies.
3. **systemd in WSL** (for the timers in §4) — inside Ubuntu:
   ```bash
   printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf
   ```
   and `wsl --shutdown` again from PowerShell.
4. **Docker Desktop for Windows** — download from docker.com, install with the **WSL2 backend**
   (default), and in Settings → Resources → WSL integration enable the Ubuntu distro.
   Settings → General → "Start Docker Desktop when you sign in" ON (the Nominatim container
   must survive reboots; `--restart unless-stopped` handles the rest).
5. **The two NTFS rules:** repo and all Docker volumes live **inside the WSL filesystem**
   (`~/…`), never on `/mnt/c` — NTFS passthrough murders Nominatim import performance. And run
   all commands below inside the Ubuntu shell, not PowerShell.
6. **Sleep settings:** Windows Settings → Power → never sleep on AC (a sleeping box misses its
   crawl timer; `Persistent=true` in §4 catches up, but a box that's awake is better).

Native **Linux (Ubuntu 24.04)** remains the zero-caveat path if this PC ever gets repurposed.

## 1. Repo + runtime

```bash
sudo apt update && sudo apt install -y git curl osmium-tool
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
git clone git@github.com:GeorgiKostov/eventmap.git && cd eventmap
npm install
```

Create `.env.local` (copy values from the Mac's `.env.local` / Vercel env):

```bash
DATABASE_URL=postgres://postgres.<ref>:<url-encoded-pw>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
GEMINI_API_KEY=…
# set AFTER step 2 is up:
NOMINATIM_URL=http://localhost:8080
```

Rules that carry over from the Mac (`tasks/lessons.md`):
- **Always** launch scripts with `--env-file=.env.local` — plain `npm run crawl` won't load it.
- **One crawl process at a time.** Never run `crawl.mjs`/`enrich-locations.mjs` concurrently with
  each other or with another machine on the same public IP *while pointing at public Nominatim*.
  Once `NOMINATIM_URL` is local this constraint relaxes to per-source-host politeness only
  (which `politeFetch` enforces internally).

Smoke test (still against public Nominatim, throttled — that's fine for one source):

```bash
node --env-file=.env.local scripts/crawl.mjs --url https://www.ottensheim.ooe.gv.at/…  # any registered source
```

## 2. Self-hosted Nominatim

[mediagis/nominatim-docker](https://github.com/mediagis/nominatim-docker) is the maintained image.
Start with the **countries we actually serve** (AT+BG+DE ≈ 5 GB PBF, imports in hours); go
Europe-wide only when EU expansion is real (~30 GB PBF, ~1–2 days import, ~700–900 GB disk).

```bash
mkdir -p ~/osm && cd ~/osm
# current coverage: Austria + Bulgaria + Germany, merged into one extract
curl -LO https://download.geofabrik.de/europe/austria-latest.osm.pbf
curl -LO https://download.geofabrik.de/europe/bulgaria-latest.osm.pbf
curl -LO https://download.geofabrik.de/europe/germany-latest.osm.pbf
osmium merge austria-latest.osm.pbf bulgaria-latest.osm.pbf germany-latest.osm.pbf -o current.osm.pbf

docker volume create nominatim-data
docker run -d --name nominatim --restart unless-stopped \
  -e PBF_PATH=/data/current.osm.pbf \
  -e IMPORT_STYLE=address \
  -e THREADS=12 \
  -v ~/osm:/data \
  -v nominatim-data:/var/lib/postgresql/16/main \
  -p 8080:8080 \
  --shm-size=8g \
  mediagis/nominatim:5.1
docker logs -f nominatim        # wait for the import to finish (AT+BG in <1h, DE several hours)
curl "http://localhost:8080/search?q=Posthof,+Linz&format=json" | head -c 300   # sanity
```

Notes:
- `IMPORT_STYLE=address` keeps the DB small while resolving venues/addresses — exactly our load.
  Use `full` if POI-name search feels weak (bigger import, better `poiQuery` hits).
- **Europe upgrade later:** same command with `europe-latest.osm.pbf`, `--shm-size=16g`, and the
  1 TB disk. Add `-e UPDATE_MODE=continuous` if you want minutely OSM diffs; for our use a
  quarterly re-import is honestly enough.
- The app side is already wired: `lib/geocode.js` reads **`NOMINATIM_URL`** and, when set, skips
  the 1.1 s throttle entirely. Unset = public instance + throttle, unchanged.

## 3. Photon (autocomplete) — optional, read this first

Photon serves the **live site's** address autocomplete (`/api/geocode?suggest=1`), which runs on
Vercel — a Photon on your LAN is unreachable from there. Self-host it only if/when we (a) expose
it publicly behind a domain + rate limit, or (b) move the app server off Vercel. For batch work,
Nominatim (step 2) covers everything the pipeline needs. If you do want it:

```bash
# Build from our own Nominatim DB (komoot/photon supports nominatim-to-photon import),
# or pull a prebuilt country index from graphhopper's mirror. Then:
docker run -d --name photon --restart unless-stopped -p 2322:2322 \
  -v ~/photon/photon_data:/photon/photon_data ghcr.io/komoot/photon:latest
```

The suggest endpoint (`app/api/geocode/route.js`) currently hardcodes komoot's public instance —
wiring a `PHOTON_URL` env is a 5-line change to make when this becomes real.

## 3b. Local LLM (Ollama) — the $0 extraction fallback

The crawl's LLM route only fires when nothing structured matched (~a minority of sources), so
this is about independence and rate-limit immunity more than cost. The provider is already wired:
`EXTRACT_PROVIDER=ollama` in `lib/extract.js`, with automatic fall-through to Gemini→Claude if
Ollama is down — a stopped model can never break a crawl.

```bash
# inside Ubuntu/WSL — native installer (no Docker needed; GPU acceleration works via WSL2
# if the box has an NVIDIA card, otherwise it runs CPU-only, which is fine for nightly batch)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:14b            # ~9 GB; strong German/Bulgarian, fits easily in 64 GB RAM
```

Add to `.env.local` on the box:

```bash
EXTRACT_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434   # default; change if Ollama runs elsewhere
OLLAMA_MODEL=qwen2.5:14b
```

**Before trusting it**, benchmark against Gemini on real pages: crawl ~20 LLM-route sources with
and without `EXTRACT_PROVIDER=ollama` and diff the extracted events (dates exact? venues not
hallucinated? unknown fields null?). Hard rule 5 applies to local models exactly as to hosted
ones — if the local model fabricates, it's out, regardless of price. Try `qwen2.5:32b` (~20 GB)
if 14b quality disappoints; the box has the RAM.

## 4. Scheduled crawl — moving off GitHub Actions

**Critical: never run both schedulers.** Two daily crawls double-hit every municipal host and
defeat the tier cadence. Sequence: bring the box's timer up → watch one clean run → **disable the
GitHub workflow** (`.github/workflows/crawl.yml`, `gh workflow disable "Scheduled crawl"`).

systemd units (`/etc/systemd/system/`):

```ini
# okolo-crawl.service
[Unit]
Description=okolo scheduled crawl
After=network-online.target docker.service
[Service]
Type=oneshot
WorkingDirectory=/home/george/eventmap
ExecStart=/usr/bin/node --env-file=.env.local scripts/crawl.mjs
```

```ini
# okolo-crawl.timer
[Unit]
Description=daily okolo crawl
[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true
[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now okolo-crawl.timer
systemctl list-timers | grep okolo     # confirm
journalctl -u okolo-crawl.service -n 50  # logs after a run
```

`Persistent=true` matters on a PC that sleeps: a missed 04:00 fires on next wake. (Windows Task
Scheduler alternative: daily task running
`wsl.exe -d Ubuntu -e bash -lc 'cd ~/eventmap && node --env-file=.env.local scripts/crawl.mjs'`.)

## 5. Backfills unlocked by the local Nominatim (run once it's up)

In this order — each shrinks the next:

| Run | Command | Was (public gate) → now |
|---|---|---|
| Location enrichment, all countries | `node --env-file=.env.local scripts/enrich-locations.mjs --all --write` | hours of Nominatim waits → fetch-bound only |
| Regeocode repair sweep | `node --env-file=.env.local scripts/regeocode.mjs` then `--write` | queued for weeks on the Mac → minutes |
| Venue search backfill (needs Grok CLI or Gemini key) | per big-city-quality §1 Stage 3 — script TBD | model-bound, geocode-verification now free |
| Fuzzy dedup sweep | `node --env-file=.env.local scripts/merge-dups.mjs [--write]` | unchanged (no geocode) — just belongs in the runbook |

Politeness stays absolute even with infinite geocoding: `politeFetch`'s ≥1s/host + robots.txt
apply on the box exactly as everywhere else — the box makes *our* lookups free, it does not make
municipal servers faster.

## 6. What stays where

| Concern | Runs on |
|---|---|
| Daily crawl + enrichment + backfills | **the box** (after §4 cutover) |
| Poster scan, add-event, site, API | Vercel (unchanged) |
| Datastore | Supabase Postgres (unchanged — box writes over the network) |
| Address autocomplete | komoot public Photon (unchanged until §3 becomes real) |
| Dev, agents, one-off mining | the Mac (unchanged) |

## 7. Watch-items after cutover

- Actions minutes worry (tasks/todo.md) disappears with the workflow disabled.
- `zero_streak`/tier drift: first box runs should show `skipped (not due)` counts comparable to
  Actions runs — if everything crawls every day, the timer is firing more than once or tiers lost.
- Nominatim disk: `docker system df` monthly; the `address` style grows slowly with diffs.
- Keep the box's clock on NTP — `starts_at` comparisons are Vienna-pinned but cadence gating uses
  host time.
