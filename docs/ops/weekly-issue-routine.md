# Weekly issue routine (Wednesday, Claude Code)

> Owner: the Claude Code desktop scheduled task `okolo-weekend-issue`, every **Wednesday 16:00
> Europe/Vienna** (took over from the Codex automation `post-okolo-weekend-carousels`, removed by
> George 2026-11-18). This file is the procedure; the task prompt only points here, so a change to
> the routine is a change to this file. Related: [`editorial-picks.md`](editorial-picks.md) (pick
> rules), [`seasonal-discovery.md`](seasonal-discovery.md) (seasons), [`weekly-automation.md`](weekly-automation.md)
> (Thursday prepare/send cron, unchanged), [`editor-descriptions.md`](editor-descriptions.md) (the
> separate daily description task).

The run is the editor, not a model API: no Anthropic/Gemini/OpenAI/xAI calls, no `lib/extract.js`
provider path (AI cost policy in `CLAUDE.md`). Never edit tracked files, commit, push or deploy in the
run; report follow-ups instead. Never send subscriber email (Thursday's guarded cron does that).

## 0. Start

1. `git -C Z:\Projects\Repositories\eventmap pull --ff-only` (if it fails, continue and say so).
2. `cd video && npm ci` only if `video/node_modules` is missing.
3. In every child process that rebuilds a digest, set `ANTHROPIC_API_KEY=` and `GEMINI_API_KEY=` empty.

## 1. Which channels

Load confirmed subscribers and route each to the nearest channel with `channelForPoint` (aggregate
counts only — never print emails or tokens). Prepare a channel when it has ≥1 confirmed subscriber
**or** its own Instagram/Facebook target (today: Linz, Vienna). Another city only with a concrete
weekend-page reason and ≥ `MIN_INDEXABLE_ITEMS` strong events; say why. Unroutable subscribers:
report the count only. Unsupported newsletter country: prepare, report delivery as blocked.

## 2. Crawlers and seasons (keep the inventory fresh)

1. `gh run list --workflow "Scheduled crawl" -L 3`: the nightly crawl must be green. If red, read the
   log, report the failing step.
2. Follow `seasonal-discovery.md` for the next 90 days (movable dates computed for this year). For
   gaps on the coming weekend, refresh **already registered, approved** sources with
   `npm run crawl -- --url <source url>`. Never bulk-access an unregistered platform (hard rule 9).
3. Report: sources that returned 0 events or errored, seasonal gaps, filters to promote or retire.
   Code or registry fixes are follow-ups for an interactive session, not this run.

## 3. Issue preparation (per channel)

1. `npm run digest -- --channel <slug> --regenerate` (deterministic build, keys empty).
2. `node --env-file=.env.local scripts/check-picks.mjs --channel <slug>`.
3. Swap every BLOCK pick with `applyReplace` + `saveDigest` (lib/digest.js); then the judgment list in
   `editorial-picks.md` (near-duplicates, not an outing, audience, usefulness). Act on
   `season_missing` when real local seasonal events exist. Require ≥ `DIGEST_MIN` good picks; if a
   subscriber-only channel can't reach it, don't publish a weak issue — report the shortage.
4. Copy: rewrite subject, intro and each teaser in the channel language from stored facts only,
   directly into the frozen digest (`loadDigest` → edit → `saveDigest`). No invented time, price, age,
   venue or quality claim; no source prose. The deterministic fallback is fine when nothing improves it.
5. Re-run `check-picks.mjs`; continue only at exit 0. Put both summaries in the report.
6. Newsletter visuals: seasonal banner only when an actual pick matches the season and dates.

## 4. Social: carousel + reel (per channel with its own targets)

Publish only to the targets configured on **that** channel (`lib/city-channels.js`); a missing target
is a skip. Never post into Facebook/WhatsApp groups. `ALREADY POSTED` is a successful no-op; never
pass `--force`.

1. Carousel: check every card URL (`/api/social/card?channel=&slide=`) returns an image, then
   `npm run social -- --channel <slug> --target instagram --dry-run`, then without `--dry-run`;
   same for `--target facebook`.
2. Reel (after the carousel, from the same frozen digest):
   `npm run reel:publish -- --channel <slug> --target instagram --render --dry-run` renders
   `video/out/<slug>-<friday>.mp4` from the frozen picks and checks it matches the digest.
   Look at 3–4 frames (`ffmpeg` at `C:\Python311\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe`):
   intro, map, a card, outro — readable text, pins on the map, no blank tiles. Then publish:
   `npm run reel:publish -- --channel <slug> --target instagram` and `--target facebook`.
   The export refuses paid (gold) picks; report that instead of working around it.
3. If one target fails, continue with the independent ones and report the exact error.

## 5. Report

Weekend date; subscriber counts per channel (aggregate); each channel prepared/skipped and why; pick
counts and both check summaries; crawl health and seasonal notes; newsletter snapshot status; post
ids/permalinks (carousel and reel, IG and FB) or `ALREADY POSTED`; follow-ups for code/sources.
