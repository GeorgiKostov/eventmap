# Skill: Verification Loop

The quality gate before any change is "done." "It compiles" is not verification.

## Steps (scale to the change)

1. **Build** — `npm run build` for anything touching routes, SSR, config, or `lib/db.js`. Must be
   clean (0 errors). This catches the serverless/tracing/SSR issues a dev server hides.
2. **Run the actual flow** — for UI/behavior changes, drive it in a browser:
   - Map renders (tiles + pins), radius circle draws.
   - Filters change the visible pin/list count correctly (date chips, range picker, categories,
     indoor/outdoor, time-of-day, kids, free).
   - Selecting from list and from map behaves the same (fly + highlight + detail).
   - Detail opens (mini-card → full on mobile; sidebar on desktop); `/event/[id]` renders + has JSON-LD.
   - Scan flow: confirm screen populates, publish adds a live pin (mock the extraction if no API key).
3. **Data sanity** — after seed/crawl changes: event count, geo-precision spread, no events with
   `ends_at <= starts_at`, expiry behaves (Vienna now).
4. **Diff review** — every changed line traces to the request. No speculative abstraction, no
   unrequested refactor, no orphaned imports. Plain-JS style matches.
5. **Docs sync** — todo/memory/lessons/affected-docs updated (post-commit housekeeping).

## Red flags
- A write path that assumes a writable project dir (breaks on Vercel — use `/tmp`).
- A new "now/today/expiry" computation not pinned to Europe/Vienna.
- An invariant (ends-after-starts, dedup, geocode-fallback) added to one write path but not its twins
  (seed / crawl / API POST).
- An `anthropic`/`openai`/`gemini` call inline in a route instead of `lib/extract.js`.
