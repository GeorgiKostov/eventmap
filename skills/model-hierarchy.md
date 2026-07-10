# Skill: Model Hierarchy (cost-optimized routing)

Manual convention — models don't auto-switch. Route by task difficulty and cost.

## For working *on* the codebase (Claude Code)
- **Sonnet** — implementation, edits, mining/search subagents, copy drafts, file ops. The default.
- **Opus** — planning, architecture decisions, code reviews, hard debugging, research synthesis over
  many sources, non-obvious tradeoffs. Escalate mid-session if a "simple" task turns complex.
- **Cheap parallel subagents** (Haiku/Sonnet) for fan-out work: mining many Gemeinde sites, checking
  many domains, broad searches. Give each a scoped brief + schema; don't pass full history.

## For the product's own AI calls (extraction — `lib/extract.js`)
This is a separate axis (see `docs/decisions/2026-07-10-scan-model-choice.md`):
- **Gemini Flash-Lite** — primary for high-volume poster/crawl extraction (cheapest, strong German OCR).
- **Claude Haiku** — fallback for low-confidence / hard posters (quality + guardrail discipline).
- Never hardcode a provider in feature code — route inside `lib/extract.js` so cost/quality is one
  swap, not a scatter.

## Rule of thumb
Spend model quality where a wrong answer is expensive: architecture/reviews (Opus), and low-confidence
event extractions (Claude). Optimize the high-volume common case for price (Sonnet subagents; Gemini
extraction).
