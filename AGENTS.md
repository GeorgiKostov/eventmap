# AGENTS.md

> Instructions for AI coding assistants (Claude Code, Cursor, Codex, etc.) working in this repo.
> Claude Code users: `CLAUDE.md` is the fuller operating system — read it too.

## What this project is

A location-based event discovery map for the **Linz region, Austria**, families-first. Real events
mined from official municipal sources + AI poster scanning, on a Google-Maps-style map. Read
`docs/design/design-doc.md` before doing significant work — it's the product bible. The thesis
(§2 there) is the emotional heart: we aggregate the events that *aren't* properly online, for
families, one region at a time. Don't propose direction changes that conflict with it without flagging.

## Who you're building for

- **Primary user:** a parent in/around Linz asking "what do we do this weekend with the kids?"
  every week. High frequency + hard constraints (age, indoor/outdoor, distance) — that's the retention.
- **Secondary (later):** municipalities/organizers who want their events found (by families, Google,
  and AI) without double data entry.
- George is in Austria (EU) — GDPR-aware for any user data; German is a first-class language, not a
  fallback, and English is the default.

## Hard rules (see CLAUDE.md for the full list)

1. **Facts + linkback, never copy source prose/images** (EU database right). Every event keeps its
   `source_url`.
2. **No provider hardcoding** — AI extraction goes through `lib/extract.js`, swappable by cost/quality.
3. **Times are Europe/Vienna** wall-clock; never compare against host TZ/UTC. Use the Vienna helpers.
4. **Never fabricate event data** — unknown fields are `null`, undated events are skipped.
5. **Supabase-portable schema** — keep `lib/db.js` a one-file port to Postgres+PostGIS.
6. **Serverless is read-only + ephemeral** — write paths must account for it until the Supabase port.

## Code style

- Next.js 15 app router, **plain JS** (no TS in this repo yet — match it; don't introduce TS piecemeal).
- Server components/routes by default; client components only where needed (the map, filters, scan).
- One file per concept; a 400-line file is a smell — but `app/page.js` is the deliberate single-client
  exception (map + all UI state). Keep helpers in `lib/`.
- MapLibre + OpenStreetMap tiles only — no Google Maps dependency (ToS + cost).
- Match the existing light-theme design system and category icon set (`lib/icons.js`).

## Testing expectations

- `npm run build` must pass before commit for anything touching routes/SSR/config.
- Drive the actual user flow (map, filter, detail, scan) in a browser for UI/behavior changes —
  don't trust "it compiles."
- The seeded `data/umkreis.db` is the demo ground truth; `npm run seed` rebuilds it from
  `data/mined/*.json`.

## How to ask the human

Stop and ask George rather than guessing on:
- Cost decisions (which AI provider/model for a new task).
- Legal/data-partnership moves (contacting municipalities, terms, what we may store).
- Anything that changes the product's phase/scope (accounts, ticketing, multi-region, native apps).
- Naming things the user will see — copy is product.
- Schema changes that would break the Supabase-portability of `lib/db.js`.
