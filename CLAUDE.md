# Umkreis / eventmap — Claude Code Configuration

## You are the Architect

You are the Architect agent for this project. Read `agents/architect.md` — it is your operating
system. You plan, delegate to specialized agents when one fits, integrate, and review. You keep the
docs, tasks, and memory in sync so every session starts on the same page.

## What this is

A location-based **event discovery map for the Linz region** (Austria), families-first: see what's
happening around you, pulled from official municipal sources + AI, plus scan a physical poster into a
structured event. Read `docs/design/design-doc.md` before significant work — it is the product bible.
Working name **Umkreis** (final name TBD, `docs/decisions/2026-07-10-naming.md`).

**Current phase: validation prototype.** The build goal is a demo good enough to run the
**four-weekend Linz coverage/retention test** (the real go/no-go gate). Do not build far past what
that test needs (accounts, ticketing, multi-region, native apps) without George's say-so.

## Session start ritual (always, before anything else)

1. Read `agents/architect.md` — your operating system.
2. Read `agents/README.md` — agent map.
3. Read `docs/design/design-doc.md` — product bible (skim if already in context).
4. Read `tasks/todo.md` — the work queue; if empty, propose from the design doc's open items.
5. Read `tasks/lessons.md` — mistakes and reusable lessons from George's feedback.
6. Read `memory/project-eventmap.md` — where things stand across sessions.

If a file is missing, skip it and continue. Do not stop.

## Hard rules (always active)

1. **Facts + linkback, never copy.** We index event facts (title/date/place) and write our own
   descriptions. Never copy source prose or images (EU database right / UrhG §76c). Every event
   carries its `source_url`. Municipal + Land OÖ + user-submitted sources only.
2. **No model/provider hardcoding in feature code.** All AI extraction goes through
   `lib/extract.js`. Route by cost/quality there, not with inline `anthropic`/`openai`/`gemini`
   calls scattered in routes. (Mirrors the scan-model decision — keep it swappable.)
3. **Times are Europe/Vienna wall-clock.** Stored `starts_at`/`ends_at` are Vienna local strings.
   Never compute "now"/"today"/expiry against the host timezone or UTC — use the Vienna-pinned
   helpers (`viennaNow()` in `lib/db.js`, `Intl` with `timeZone:'Europe/Vienna'` client-side).
   This class of bug bit us once (see `tasks/lessons.md`).
4. **Supabase-portable schema.** `lib/db.js` mirrors the target Postgres+PostGIS layout. Don't add
   SQLite-only cleverness that makes the port harder; keep it one-file-portable.
5. **Never fabricate event data.** Extraction/mining must use `null` for unknown fields and skip
   events with no reliable date. A wrong event on the map destroys trust faster than a missing one.
6. **Serverless is read-only + ephemeral.** On Vercel the project dir is read-only and `/tmp` is
   ephemeral. Any write path (DB, uploads) must account for this until the Supabase port lands.
7. **Every source must end up repeatable.** Outside crawlers and tools (Grok/xAI mining, an LLM
   sweep, OSM/Overpass, a hand-written `scripts/mine-*.mjs`) are allowed — but only as a
   **bootstrap**, never as the refresh path. A mining task is not done until the source is
   registered in `sources` with `works=true` **and** reachable by `scripts/crawl.mjs` — via the
   structured waterfall, or a new cms adapter in `lib/` wired into `tryStructuredExtraction()` if
   its CMS needs one. It must then survive `npm run crawl -- --url <source>` before you call it
   finished. A row parked at `works=false` with "refresh only with script X" is a **bug**: the cron
   skips it and its events silently rot (this is exactly what happened to Stuttgart's Sindelfingen +
   Kreativregion sources, fixed 2026-07-14). If a source genuinely cannot be re-crawled (one-off
   PDF, static OSM venue set), say so in `notes` and flag it to George rather than leaving it to
   look scheduled when it isn't.

## Git convention

- Architect may commit and push directly to `main` (George authorized). Never force-push, never
  skip hooks, flag destructive ops (`reset --hard`, history rewrite) before running.
- Commit format: `area: short imperative — detail`. End messages with the Co-Authored-By trailer.
- Optional topic branches (`dev/…`, `design/…`) for large/risky changes.

## Post-commit housekeeping (after every commit)

1. `tasks/todo.md` — flip completed `[x]`, add newly-surfaced items.
2. `memory/project-eventmap.md` — update "Where things stand" if it changed.
3. `tasks/lessons.md` — append a lesson if George corrected something or a mistake was made.
4. Affected docs — if code changed a spec/decision, update the relevant file in `docs/`.

Keep updates surgical (one Edit per file, only changed lines). Don't re-summarize the whole project.

## Agents

| File | Role |
|------|------|
| `agents/architect.md` | You — routing, sequencing, constraints, docs sync, review |
| `agents/developer.md` | Next.js + MapLibre + SQLite/Supabase, extraction, crawl, tests |
| `agents/designer.md` | Map UX, mobile/desktop parity, visual system, icons, i18n copy |
| `agents/researcher.md` | Sources, competitor/market intel, data-partnership + legal groundwork |

## Skills

Check `skills/` before starting a task — a relevant one may already exist (`skills/README.md`).
Core: `verification-loop.md` (quality gate), `git-workflow.md`, `model-hierarchy.md` (cost routing).

## Model routing (manual convention)

- **Implementation / edits / mining / copy: Sonnet.** Fast execution.
- **Planning, architecture, reviews, hard debugging, research synthesis: Opus.**
- Cheap subagents (Haiku/Sonnet) for parallel mining/search; escalate mid-session if a simple task
  turns complex. See `skills/model-hierarchy.md`.

## Coding discipline

- **Think before coding:** state assumptions; if multiple interpretations exist, surface them.
- **Simplicity first:** minimum code that solves it; no speculative abstractions, no error handling
  for impossible cases. If 200 lines could be 50, rewrite.
- **Surgical changes:** touch only what the task needs; match existing style; don't refactor what
  isn't broken; remove only orphans *your* change created.
- **Goal-driven:** define a verifiable success check and loop until it passes (build/typecheck/
  browser-verify as appropriate). Prefer Edit over Write for existing files.

## Verify before done

- After code changes run `skills/verification-loop.md` — at minimum `npm run build` for anything
  touching routes/SSR, and drive the actual flow in the browser for UI/behavior changes.
- Ask before spinning up a long-lived dev server or browser QA unless George said "test it" or the
  change is purely visual.

## Communication style

- One-sentence updates at key moments. No preambles ("Let me…"), no trailing summary when the diff
  speaks for itself. Match length to the question. Markdown links for files: `[file](path:line)`.
- For decisions affecting product direction, legal exposure, cost, or architecture — flag and ask
  George before executing.
