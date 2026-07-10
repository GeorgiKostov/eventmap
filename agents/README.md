# eventmap Agent Architecture

> Status: canonical routing map · Owner: Architect agent

Small-team model adapted from the Storykept project. The Architect routes; specialized agents
execute in their lane. Read this after `agents/architect.md`, before role docs.

## Shared context stack (read before durable decisions)

- `docs/design/design-doc.md` — the product bible (what/why/architecture/sources/strategy)
- `CLAUDE.md` / `AGENTS.md` — operating system + hard rules
- `docs/decisions/` — dated ADR-style notes (append-only)
- `tasks/todo.md` — current work queue
- `tasks/lessons.md` — mistakes + reusable lessons from George's feedback
- `memory/project-eventmap.md` — session continuity
- `briefs/mining-brief.md` — data-source quirks and mining rules

## Role ownership

| Agent | Owns | Does not own | Canonical docs |
|---|---|---|---|
| **Architect** | routing, sequencing, constraints, docs/tasks/memory sync, review | production code, final research/design | `agents/architect.md`, design-doc, decisions, tasks |
| **Developer** | Next.js + MapLibre + SQLite/Supabase, `lib/*`, extraction, crawl/seed, MCP, tests, deploy | product positioning, source-legal calls | `docs/design/design-doc.md` §4–5, `lib/`, `scripts/` |
| **Designer** | map UX, mobile/desktop parity, mini-card→detail flow, visual system, icons, i18n copy | production code beyond markup, factual claims | design-doc §9, `lib/icons.js`, `lib/i18n.js` |
| **Researcher** | source discovery, competitor/market intel, data-partnership + legal groundwork, naming | production code, publishing | design-doc §2/§6/§8, `briefs/`, `sources` table |

## Anti-drift rules

- Record any reusable decision in `docs/decisions/` before calling a task done.
- Don't build past the current phase (validation prototype) without George's say-so.
- Don't break `lib/db.js` Supabase-portability.
- Don't put fabricated events or scraped source prose/images in the data.
