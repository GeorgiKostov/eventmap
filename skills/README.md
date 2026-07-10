# Skills

Focused instruction sets agents load for specific tasks. Adapted (pared down) from the Storykept /
Rebuilt skill library to the essentials this project actually uses. The Architect references the
relevant skill in a brief; check here before starting a task.

| File | Used by | Purpose |
|------|---------|---------|
| `verification-loop.md` | Developer, Architect | Quality gate — build, run the flow, review the diff before "done" |
| `git-workflow.md` | All (Architect runs it) | Branch/commit convention, safe-push guardrails |
| `model-hierarchy.md` | Architect | Cost-optimized model routing — cheap subagents vs. escalate to Opus |

More can be pulled from `~/Repositories/storykept/skills/` if a task needs them (deep-research,
seo-and-aio, design-taste-frontend, docs-sync, workflow-orchestration, humanizer, etc.) — copy and
adapt rather than referencing across repos.
