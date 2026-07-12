---
description: Mine REAL Bulgarian municipal events via Grok Build (xAI agentic CLI) into seed-ready JSON for this repo
---

You are orchestrating an **agentic event-mining run for Bulgaria** using **Grok Build** — xAI's
terminal coding agent, run headless via the local `grok` CLI on George's SuperGrok subscription
(OAuth entitlement, not the metered xAI API — no per-token billing). Grok has web/shell/read/write
tools, so it can fetch Bulgarian municipal calendars, parse them, and write the output file itself.

> This is the **eventmap** version of the tool. The `/grok` and `/hermes` commands in the storykept
> repo are *code-review* commands hardcoded to that repo — do NOT use them here. This command is for
> **crawling**, points only at `/Users/georgikostov/Repositories/eventmap`, and enforces THIS
> project's hard rules.

**Authority: `skills/crawl-doctrine.md`** — the canonical standard every crawl must follow (engine,
hard rules, seed-compatible output shape, validation, ingest). Read it first; the rules restated
below are the BG-applied copy of it, and the doctrine wins if anything ever diverges. Grok runs on
the **SuperGrok subscription** (OAuth), never the metered API and never via `/hermes`.

## Scope of this run

$ARGUMENTS

(If empty, default scope = every town in `data/catalog/probed-bg.json` that has a non-null
`calendar_url`, upcoming events for the next ~8 weeks only.)

## Steps

1. **Load context (Read these before building the prompt):**
   - `briefs/bulgaria-grok-kit.md` — per-field meanings and the Cyrillic example.
   - `data/catalog/probed-bg.json` — the target towns, their `calendar_url`, and CMS fingerprint
     (use `cms` + `structured_data` to tell Grok how each site is likely structured).
   - `data/catalog/municipalities-bg.json` — official община/oblast names (use these verbatim for
     `town` / `oblast`; never invent or transliterate).
   Narrow the town list to the requested scope (or the default above).

2. **Build the mining prompt.** Write it to `/tmp/grok-crawl-bg.txt`. It MUST contain, in this order:

   a. **Role:** "You are an expert event-data miner. Fetch the given official Bulgarian municipal
      sources, extract only REAL upcoming events, and write them to the output file. You are indexing
      facts with a linkback — you never copy source prose and never invent data."

   b. **Hard rules (verbatim — these are eventmap's law):**
      - **Never fabricate.** Unknown field → `null`. No reliable date → **skip the event entirely**.
        A wrong event on the map destroys trust faster than a missing one. Do NOT emit placeholder
        URLs, example IDs, or guessed dates. If you fetched nothing real from a source, emit no
        events for it and record it in `failed_urls`.
      - **Facts + linkback, never copy.** Index title/date/place only. Write `description_short`
        yourself — one short **Bulgarian Cyrillic** sentence in your own words. Never paste source
        prose (EU database right / UrhG §76c).
      - **Cyrillic verbatim.** All human-readable text (`title`, `venue`, `address_text`, `town`,
        `oblast`, `description_short`, `source_name`) stays in original Bulgarian Cyrillic. Never
        transliterate or translate to Latin/English.
      - **Every event carries the exact `source_url` it was seen on** (the detail/listing page you
        actually fetched — not the site root).
      - **Times are local Sofia wall-clock as printed on the source**, stored as plain strings
        (`date_start: "YYYY-MM-DD"`, `time_start: "HH:MM"` or `null`). Do not convert timezones.
      - Municipal / Land / official-tourism sources only. `is_free`/`age_min`/`age_max`/`indoor` →
        `null` unless the source states them.

   c. **Exact output shape — this is seed-compatible; DO NOT emit a bare array.**
      `scripts/seed.mjs` reads `data.source_registry` and `data.events`, so the file MUST be:
      ```json
      {
        "source_registry": [
          { "name": "string", "url": "string", "kind": "crawl",
            "town": "string (Cyrillic община)", "works": true, "notes": "string|null" }
        ],
        "failed_urls": ["url that returned nothing usable / blocked / JS-only"],
        "events": [
          {
            "title": "string (Cyrillic)",
            "description_short": "string|null (own words, Cyrillic, 1 sentence)",
            "date_start": "YYYY-MM-DD",
            "time_start": "HH:MM|null",
            "date_end": "YYYY-MM-DD|null",
            "time_end": "HH:MM|null",
            "venue": "string|null",
            "address_text": "string|null",
            "town": "string (Cyrillic община, must match municipalities-bg.json)",
            "oblast": "string (Cyrillic)",
            "categories": ["family|festival|market|music|culture|food|sport|workshop"],
            "is_free": "boolean|null",
            "age_min": "integer|null",
            "age_max": "integer|null",
            "indoor": "boolean|null",
            "source_url": "string (required — the page it was seen on)",
            "source_name": "string (Cyrillic, e.g. Община Чепеларе / Visit Sofia)",
            "country": "BG"
          }
        ]
      }
      ```
      Note the field names that differ from the kit's older bare-array schema: use
      `description_short` (not `description`) and `address_text` (not `address`) so `seed.mjs`
      ingests them directly. `country` MUST be `"BG"` on every event.

   d. **The target sources**, one line per town: `<Cyrillic town> — <calendar_url> — cms:<cms>`
      (pulled from step 1). Tell Grok to also try the town's official site root if the calendar_url
      404s, and to record every URL it tried in `source_registry`/`failed_urls`.

   e. **The output path:** instruct Grok to WRITE the result file itself to
      `data/mined/events-bg-<TODAY>.json` (you will substitute `<TODAY>` in the run command below),
      pretty-printed UTF-8, and to print a one-line summary (events kept, sources ok, sources
      failed) to stdout when done.

3. **Run Grok Build** — headless, tools ON, from the eventmap repo root so it can fetch, parse, and
   write into `data/mined/`:
   ```bash
   cd /Users/georgikostov/Repositories/eventmap && \
     OUT="data/mined/events-bg-$(date +%F).json" && \
     grok -m grok-build -p "$(cat /tmp/grok-crawl-bg.txt)

   Write your final JSON to: $OUT" 2>&1
   ```
   - Use `grok-build` (xAI's agentic coding model). Run it in the **background** (a real crawl takes
     2–8 min); use a generous tool timeout (~420000ms).
   - This is a *mining* run — Grok legitimately needs its web/shell/write tools. It should only write
     the single output file under `data/mined/`; it must not touch source code. After it returns,
     confirm `git status` shows only the new `data/mined/events-bg-*.json` (and nothing under `app/`,
     `lib/`, `scripts/`).

4. **Validate the output — do NOT trust it blindly** (the last run produced placeholder data):
   - File parses as JSON and is the `{ source_registry, events }` object shape (not a bare array).
   - Every event has a real `date_start` (matches `^\d{4}-\d{2}-\d{2}$`), a non-empty `source_url`
     that is NOT a placeholder (reject anything ending in an obvious dummy id like `/12345`, or a
     bare domain root), `country: "BG"`, and `town` present in `municipalities-bg.json`.
   - Spot-check 2–3 events: `curl` (or WebFetch) the `source_url` and confirm the title/date are
     really on that page. Drop any event you cannot confirm; report how many you dropped and why.
   - Confirm all human text is Cyrillic (no accidental transliteration).
   Report counts per oblast and the failed-source list.

5. **Ingest (only after validation passes, and show George the command first — don't auto-run bulk
   inserts):**
   ```bash
   # Register the town sources Grok confirmed working (dry run first, then --write):
   node --env-file=.env.local scripts/register-probed.mjs --file data/catalog/probed-bg.json
   # Seed events — reads ALL data/mined/*.json, so the new events-bg-<date>.json is picked up:
   npm run seed
   ```
   After seeding, spot-check the map for a couple of the new Bulgarian pins.

Notes:
- Runs on the SuperGrok entitlement (OAuth), not the metered xAI API — no per-token billing.
- If `grok` errors (not logged in / unknown model / entitlement), run `grok models` and
  `grok --version` and report what they say instead of failing silently. Grok 4.5 may still be EU-
  gated — don't pass `-m grok-4.5` unless `grok models` lists it.
- Honest small result beats a padded one. If a source is a JS-only SPA that `curl` can't render,
  record it in `failed_urls` with a note rather than guessing its events.
