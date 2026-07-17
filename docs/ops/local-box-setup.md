# Local crawl box — setup runbook (Ryzen 9 7900X / 64 GB / RTX 4070 Ti SUPER 16 GB)

**The box, measured 2026-07-17** (§3b's numbers assume exactly this): Ryzen 9 7900X (12C/24T),
63.1 GB RAM, **NVIDIA RTX 4070 Ti SUPER with 16 GB VRAM** (driver 596.21, compute 8.9). The 16 GB
is the binding constraint for local models — not the 64 GB of RAM, which is what the earlier draft
of this doc wrongly reasoned from. A model + its KV cache must fit in **16 GB** or layers spill to
CPU and throughput drops ~5×. (`nvidia-smi` reports it correctly; Windows' `Win32_VideoController`
says "4 GB" — that field is a 32-bit overflow, ignore it.)

**Goal:** run the whole extraction stack on George's PC — the crawler, the location-enrichment
second hop, and (the actual reason the box matters) **self-hosted Nominatim + Photon**, which
deletes the 1.1 s/lookup public-instance gate that caps every backfill. Companion docs:
[`docs/architecture/eu-scale-extraction.md`](../architecture/eu-scale-extraction.md) (why this
architecture), [`docs/design/data-pipeline.md`](../design/data-pipeline.md) (what the pipeline does),
[`docs/design/big-city-quality.md`](../design/big-city-quality.md) (the enrichment ladder).

Everything below assumes the box reaches the internet and can hold ~150 GB (country extracts) or
~1 TB NVMe free (full Europe, later).

## 0. The prerequisite that ate a morning: SVM must be ON in the BIOS

Docker on Windows runs Linux containers in a VM (WSL2 or Hyper-V). **A VM needs AMD-V.** No flag,
no workaround. Check first — this is the whole gate:

```powershell
systeminfo | Select-String "Virtualization Enabled"   # want: ... In Firmware: Yes
```
(Or Task Manager → Performance → CPU → Virtualization.) If **No**, on this board
(Gigabyte X670 AORUS ELITE AX, BIOS F8a): reboot → **Del** → **F2** (Advanced Mode) →
**Tweaker → Advanced CPU Settings → SVM Mode → Enabled** → **F10 → Yes**. Gigabyte moves it
between BIOS revisions; fallback is **Settings → AMD CBS → CPU Common Options → SVM Enable**. It is
*not* under Settings → Miscellaneous.

Diagnostics worth keeping, all learned the hard way 2026-07-17:
- **Secure Boot is irrelevant.** Disabling it does nothing for SVM and is a real security
  downgrade. **DEP is a red herring** too — Docker's error names it, but it was already available.
- **Fast Startup can mask a BIOS change** (`HiberbootEnabled=1`): "shut down" is a hybrid hibernate
  that resumes the old kernel session. Use **Restart**, or `powercfg /hibernate off` (also frees a
  ~RAM-sized `hiberfil.sys` on C:).
- **A setting that reverts on reboot is a different bug.** Differential test: did another BIOS
  change persist? (`HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State` →
  `UEFISecureBootEnabled`). If yes, the CMOS battery is fine and it's SVM-specific — don't pull the
  battery on generic internet advice.
- WSL reporting a kernel version proves nothing: the package installs fine without SVM, it just
  can never boot a distro. "No installed distributions" + a dead Docker engine is the tell.

## 1. The Windows-native path — no Ubuntu distro, no systemd

**This doc used to prescribe WSL2 + Ubuntu-24.04 + systemd + an "everything lives inside the WSL
filesystem" rule. None of that is needed.** Docker Desktop creates its own `docker-desktop` distro;
Node and Ollama run natively on Windows. What is actually required:

1. **Docker's privileged service must run**, or the backend starts, sees `serviceIsRunning = false`
   and silently shuts itself down in a loop:
   ```powershell
   # ADMIN PowerShell. "Access is denied" = not elevated (Win+X -> Terminal (Admin)).
   Set-Service com.docker.service -StartupType Automatic   # or it dies again on every reboot
   Start-Service com.docker.service
   ```
2. **Put Docker's disk on a big NVMe — before first start.** Default is `%LOCALAPPDATA%\Docker\wsl`
   on C:, which has ~71 GB free here; the Nominatim DB is ~104 GB. In `%APPDATA%\Docker\settings.json`:
   ```json
   "customWslDistroDir": "Z:\\Docker\\wsl"
   ```
   **`dataFolder`, `memoryMiB`, `diskSizeMiB`, `cpus` in that file are Hyper-V settings and are
   IGNORED under the WSL2 backend** — don't be alarmed by `memoryMiB: 2048`. WSL2 memory lives in
   `%USERPROFILE%\.wslconfig`:
   ```ini
   [wsl2]
   memory=40GB
   processors=16
   swap=8GB
   ```
   Verify it landed: `Get-ChildItem Z:\Docker\wsl -Recurse -Filter *.vhdx`.
   Also Settings → General → "Start Docker Desktop when you sign in" ON, or Nominatim isn't up at 04:00.
3. **Drive choice matters.** Here: C: SATA SSD (too small), **Z: 970 EVO Plus NVMe (chosen)**,
   V: NVMe, D: 4.5 TB but a **mirrored Storage Space over SATA HDDs** — huge and exactly wrong for a
   random-write-heavy import. Nominatim's docs are blunt that fast NVMe is essential.
4. **Node**: native Windows Node ≥20 is fine (v24.13.1 here) — no WSL, no nodesource.
   **`npm install` is not optional and is not done on a fresh clone.**

Native **Linux** remains the zero-caveat path if this PC is ever repurposed.

## 1b. Repo + env

Create `.env.local` (copy from the Mac; **Vercel env vars are write-only — `vercel env pull`
returns empty values**, so they must be pasted by hand):

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
  -e IMPORT_STYLE=full \
  -e THREADS=16 \
  -e NOMINATIM_PASSWORD=okolo_local \
  -v ~/osm:/data \
  -v nominatim-data:/var/lib/postgresql/16/main \
  -p 8080:8080 \
  --shm-size=8g \
  mediagis/nominatim:5.3
docker logs -f nominatim        # BUILT 2026-07-17: osm2pgsql 33m52s, full import ~2h40m
curl "http://localhost:8080/search?q=Posthof,+Linz&format=json" | head -c 300   # sanity — see below
```

### ⚠ IMPORT_STYLE=full, NOT address — this doc said `address` until 2026-07-17, and it was wrong

Nominatim's docs: `address` = *"all data necessary to compute addresses down to house number
level"*; only `full` is the *"style that also includes points of interest."* But `geocodeEvent()`'s
**first precise rung is `poiQuery()`** — a venue-**name** search requiring an
`amenity|leisure|tourism|building|man_made` match. On an `address` import that rung returns nothing,
every venue silently degrades to a town centroid, and — worse — `poiQuery` **caches the miss**, so
one backfill would mass-poison the prod geocache with negatives that outlive the fix (the Bad Ischl
lesson, at scale). Measured on our instance:

```
search?q=Posthof,+Linz
  amenity/arts_centre  | Posthof       | 48.3117,14.3117   <- the venue   (only with `full`)
  highway/residential  | Posthofstraße | 48.3143,14.3079   <- the street  (all `address` would have)
```
On `address` only the street exists, and `tryQuery` would pin events to it. **A confidently-wrong
pin is worse than an honest town centroid.** Note the sanity check above was *always* a POI query —
it would have returned empty and told us.

### Why all three countries, not just the new one

`NOMINATIM_URL` is a **global** switch — no per-country routing. Point it at a DE-only instance and
every AT/BG lookup goes there too, gets a valid `200 + []`, and `tryQuery`/`poiQuery` **cache that
as a genuine miss** (only 429/5xx throw and skip the cache). Every new Linz venue would earn a
permanent false negative. AT+BG is +929 MB on Germany's 4,577 — cheap insurance.

### Measured on this box (2026-07-17)

| | |
|---|---|
| osm2pgsql load | **33m 52s** · full import through rank 30 **~2h 40m** |
| DB size | **~104 GB** (planet figures in Nominatim's docs do NOT scale linearly down) |
| Largest tables | planet_osm_nodes 36 GB · planet_osm_ways 22 GB · **placex 18 GB** · place 12 GB |
| Wikipedia importance | **skipped — and it doesn't matter.** Local vs public returned *identical* top-1 hits on 5 ambiguous venue tests (incl. "FEZ, Berlin" → a taxi stand, which public gets "wrong" too). Don't re-import for it. |
| Through our own code | `forwardGeocode` ×10 DE towns = **2041ms** (public floor: 11000ms+ serialized) · `geocodeEvent('Labyrinth Kindermuseum','Berlin')` → **venue** precision · `'Online'` → town, 0ms (sentinel guard intact) |

Notes:
- `nominatim refresh --drop` would free ~71 GB of update-only scaffolding (`planet_osm_*`, `place`)
  — **but Docker's `ext4.vhdx` never shrinks**, so it frees space only *inside* the VHDX, not on the
  host. Bad trade against losing incremental updates while 578 GB is free. Not done.
- **Europe upgrade later:** same command with `europe-latest.osm.pbf`, `--shm-size=16g`, and the
  1 TB disk. Add `-e UPDATE_MODE=continuous` for minutely OSM diffs; for our use a quarterly
  re-import is honestly enough.
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

**Ollama runs natively on Windows here, not in WSL** — that's what's installed on the box, and it
gets the GPU without any passthrough. Keep it that way; `OLLAMA_URL` points the crawl at it either
way. **Needs Ollama ≥ 0.32** — gemma4 does not exist in older builds (the box sat on 0.17.1 and
literally could not load it).

```powershell
winget upgrade --id Ollama.Ollama    # or install once with `winget install Ollama.Ollama`
ollama pull gemma4:12b               # 7.6 GB — the box's model, benchmarked below
```

Add to `.env.local` on the box:

```bash
EXTRACT_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434   # default; change if Ollama runs elsewhere
OLLAMA_MODEL=gemma4:12b
# OLLAMA_NUM_CTX=32768              # default in code; see "the two settings" below
```

### Why gemma4:12b (measured 2026-07-17 on this box, not chosen from benchmarks)

Five models were run against the same four real pages — two German (innsbrucktermine.at,
linztermine.at), two Bulgarian (obshtinaruse.bg, gotoburgas.com) — through the real
`extractFromPage()`, with `gemini-2.5-flash-lite` (what production uses today) as the reference row.

| model | Innsbruck (DE) | Linz-Termine (DE) | Русе (BG) | Burgas (BG) | verdict |
|---|---|---|---|---|---|
| **gemini-2.5-flash-lite** *(reference)* | 27 | 5 | 6 | ~110 | the bar |
| **gemma4:12b** | 13 | **5** | 6 | **107** | **shipped** |
| qwen3:14b | 14 | **0** | 6 | 19 | misses implied dates |
| qwen3.5:9b | 12 | **0** | 6 | ✗ invalid | ignores the 25-event cap, runs to 18k tokens |
| qwen2.5:14b *(the old default)* | 8→14 | 0 | 5 | 24, **3 fabricated** | wrong keys, invents titles |
| gemma3:12b | **0** | **0** | 6 | 15 | blind on German; Gemma Terms licence |

The decider is **linztermine.at**, the tier-2 source the Linz validation test leans on. Its homepage
lists events under "Heute in Linz" with a time but **no date** — the date is only inferable from
"Heute ist der 17.07.2026" elsewhere on the page. Gemma 4 is the only local model that makes that
inference; every other one returns an empty array and looks like an honest "no events here". That
failure is invisible in aggregate (a zero from a real source reads exactly like a quiet week) and it
is why a reference row is not optional.

### Live on the box — George's call, 2026-07-17 (REVERSED same day, see below)

**First call: `EXTRACT_PROVIDER=ollama`, the nightly crawl runs local.** George's reasoning: no
users yet, so don't spend money; dropping 2–3 events at prototype stage is not a big deal; switch
back to Gemini once there are users. Recorded rather than argued — with the expiry trigger below,
because nothing else would remind us.

**⚠ Switch `EXTRACT_PROVIDER` back to Gemini before the four-weekend Linz coverage test runs for
real** (i.e. as soon as there are actual subscribers). That test's go/no-go metric *is* coverage —
if it runs on the cheaper extractor we would be measuring our own recall, not Linz's supply, and a
gap this silent is indistinguishable from a thin week. One line in `.env.local`, no code change.

### REVERSED 2026-07-17 (same day): `EXTRACT_PROVIDER` is UNSET — the crawl runs on Gemini

A second reference-row run, during the Germany/Berlin expansion, added a page shape the bake-off
above didn't cover — and it breaks the premise of the first call:

| page | Gemini | gemma4:12b |
|---|---|---|
| hennigsdorf.de (7,918 chars, ordinary municipal) | 6 | **5** — near parity, matches the table above |
| **kinderkulturkalender-berlin.de (54,870 chars, dense family listing)** | **26** | **2** |

The first call priced the trade at "2–3 events". That holds for Hennigsdorf. It does not hold at
**8% recall** on a dense listing — and kinderkulturkalender is a *family* source in the Berlin
scope, i.e. exactly the supply this product exists to surface. gemma4 still fabricated nothing
(the hard-rule-5 bar it passes and qwen2.5 failed); it just silently doesn't *see* most of a dense
page, which is the failure mode the expiry trigger above was written to avoid. At ~$1.30/month for
both DE cities, the trade isn't worth it even with zero users. **Ollama 0.32.1 + gemma4 stay
installed on Z: for experiments; the crawl is on Gemini.**

**Caveat on the numbers above (and a lesson):** an earlier pass this session "measured" gemma4 at
194s/page and unusable, and was **wrong** — it benchmarked a hand-rolled reimplementation of
`callOllamaText` that used `format:'json'` with no schema, no `think:false` and no pinned `num_ctx`,
i.e. the code *before* c590e12. Through the real `extractFromPage()` on Ollama 0.32.1, gemma4 runs
in **13–17s** with zero out-of-enum categories. **Benchmark the real call path, not your model of
it** — the two settings below are the entire difference.

**The measured gap, so the trade is explicit.** gemma4 is a strict *subset* of Gemini — across all
four pages it invented **nothing** (0 ungrounded titles, 0 events Gemini didn't also find), which is
the bar hard rule 5 actually sets, and qwen2.5 failed it. It hits **exact parity on 3 of 4 pages**
(linztermine 5=5, Русе 6=6, Burgas 107≈110). On the dense Innsbruck listing it silently missed **4
real events** (verified present in the page text — incl. a festival the next day). The raw "13 vs 27"
headline was misleading: Gemini repeats one title across its occurrence dates, which our series
dedup collapses anyway. Blast radius is the **LLM route only** — structured sources (GEM2GO/JSON-LD/
iCal) are untouched, and `extractFromImage` (poster scan) never consults `EXTRACT_PROVIDER`, so
user-facing intake stays on Gemini.

Licences (checked, because we ship commercially): gemma4 is **Apache-2.0** since March 2026 — a real
change from the old Gemma Terms, which is why gemma3 is not the answer. qwen3.5/qwen3 are Apache-2.0
too. Avoid **LFM2.5** (its licence cuts off commercial use at $10M revenue) and any `:cloud` tag
(defeats $0 and does not support structured outputs).

### The two settings that mattered more than the model

1. **`format` takes the JSON schema, not `'json'`.** Ollama compiles a schema to a GBNF grammar and
   constrains every token. With plain `format:'json'`, qwen2.5 emitted categories like
   `"Diverse Musikveranstaltungen"` and dropped `date_end`/`time_end` entirely — and since
   `crawl.mjs` reads exact keys, **every one of those events was silently discarded downstream**.
   That, not the model, is most of what "it works okaish" was. Gemini *cannot* use this schema (its
   OpenAPI subset rejects our `["string","null"]` dialect); Ollama can. It does **not** prevent
   fabrication — only malformed output.
2. **Pin `num_ctx`.** Ollama sizes the window to the model's trained max and the KV cache with it.
   `qwen2.5:14b` auto-picked 32768 → an 18 GB footprint on a 16 GB card → 12 of 49 layers spilled to
   CPU → **11.3 tok/s**; pinned so it fits, **60.6 tok/s** for byte-identical output. gemma4's cache
   is cheap enough that 32768 costs nothing (8.4 GB / 100% GPU at both 16k and 32k) — and the
   headroom is load-bearing, because output shares the window and a dense listing needs ~10k tokens
   of JSON.

Also: **every current model thinks by default** (gemma4 emitted 7.9k chars of reasoning, qwen3.5
22.7k) — that re-feeds as input, inflates prompt tokens ~5× and eats the context until the JSON
truncates. `lib/extract.js` sends `think: false` unconditionally (verified accepted by every model
tested, thinking or not). Do not remove it.

**Before trusting any change here**, re-run the bake-off rather than reading benchmarks: crawl real
LLM-route sources with and without `EXTRACT_PROVIDER=ollama` and diff against Gemini — including a
page you know has **no** events, since fabrication only shows up where there is nothing to find.
Hard rule 5 applies to local models exactly as to hosted ones: if it fabricates, it's out, whatever
it costs. (qwen2.5 invented 3 titles that appear nowhere in the Burgas page. That is the bar it
failed.)

## 4. Scheduled crawl — moving off GitHub Actions

**Critical: never run both schedulers.** Two daily crawls double-hit every municipal host and
defeat the tier cadence. Sequence: bring the box's timer up → watch one clean run → **disable the
GitHub workflow** (`.github/workflows/crawl.yml`, `gh workflow disable "Scheduled crawl"`).

**No systemd — this is Windows, and there is no Ubuntu distro (§1).** Task Scheduler, daily:

```powershell
$action  = New-ScheduledTaskAction -Execute "node.exe" `
  -Argument "--env-file=.env.local scripts/crawl.mjs" `
  -WorkingDirectory "Z:\Projects\Repositories\eventmap"
$trigger = New-ScheduledTaskTrigger -Daily -At 4am
$set     = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 6)
Register-ScheduledTask -TaskName "okolo-crawl" -Action $action -Trigger $trigger -Settings $set
```

`-StartWhenAvailable` is the `Persistent=true` equivalent: a missed 04:00 fires on next wake.

> **⚠ The bug this whole section rested on, found 2026-07-17.** `scripts/crawl.mjs` ran **nothing**
> on Windows: its entrypoint guard was ``import.meta.url === `file://${process.argv[1]}` ``, and on
> Windows `argv[1]` is a backslashed drive path (`Z:\...\crawl.mjs`) while `import.meta.url` is
> `file:///Z:/.../crawl.mjs` — they can never be equal, so `main()` never ran. `npm run crawl`
> exited **0, printed nothing, and crawled zero sources**. On the very machine this cron is meant to
> move to. Fixed with `pathToFileURL` (commit c758e41). **If you ever see a silent, instant,
> successful-looking crawl, that is the shape of it** — and note a green exit code proved nothing.

## 5. Backfills unlocked by the local Nominatim (run once it's up)

In this order — each shrinks the next:

| Run | Command | Was (public gate) → now |
|---|---|---|
| Location enrichment, all countries | `node --env-file=.env.local scripts/enrich-locations.mjs --all --write` | hours of Nominatim waits → fetch-bound only |
| Regeocode repair sweep | `node --env-file=.env.local scripts/regeocode.mjs` then `--write` | queued for weeks on the Mac → minutes |
| Venue search backfill (needs Grok CLI or Gemini key) | per big-city-quality §1 Stage 3 — script TBD | model-bound, geocode-verification now free |
| Negative-geocache recheck | 14,494 of 22,805 geocache rows are `hit=false` (measured 2026-07-17; DE holds only 298 rows total, which is *why* Germany was geocode-bound). They were honest misses against public Nominatim, but re-querying is ~free now. **Measure before purging** — `purgeNegativeGeocache()` is a big hammer. | blocked → cheap |
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
- Nominatim disk: `docker system df` monthly. `--drop` was NOT run, so the incremental-update path
  stays open; otherwise re-import from a fresh PBF quarterly (~2h 40m, unattended).
- Keep the box's clock on NTP — `starts_at` comparisons are Vienna-pinned but cadence gating uses
  host time. NB `w32tm /query /status` on this box reports `Source: Local CMOS Clock`, never
  NTP-synced — worth fixing before the cutover.
- **A crawl that exits 0 in seconds with no output is not a fast crawl** — see the §4 warning.
