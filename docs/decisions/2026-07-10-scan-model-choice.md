# 2026-07-10 — Which AI lab/model for poster scanning

Status: recommended (not yet implemented) · Owner: Architect
George's question: "for scanning, which lab has best features for our needs and cheapest — Google,
OpenAI, or Anthropic?"

## The workload

Poster/flyer/screenshot → structured event JSON (title, date/time, venue, categories, price flag,
age, per-field confidence). Characteristics that decide the winner:
- **Vision OCR** of messy real-world images (weathered posters, artistic layouts, handwriting).
- **Strong German** (Austrian posters, dialect place names).
- **Structured JSON output** with a schema.
- **High volume, cost-sensitive, latency-tolerant** — it's a background extraction, not a chat.
- Cheap enough that a user scanning a poster costs a fraction of a cent.

This is the classic "cheap vision-OCR + structured extraction" task, not a reasoning task. That
profile favors the small/flash tier of each lab, and on that tier **price and OCR quality**, not
frontier reasoning, are what matter.

## The three labs (small/cheap vision tier)

- **Google — Gemini Flash / Flash-Lite:** the price/performance leader for this workload. Lowest
  per-image cost of the three, a genuinely useful free tier, very strong multilingual OCR and
  document understanding, native structured output (`responseSchema`). Best fit for high-volume
  scanning economics.
- **Anthropic — Claude Haiku (what we use now):** the quality / instruction-following leader.
  Excellent at "don't fabricate, use null, resolve the nearest future date," clean structured
  outputs, reliable German. Pricier per token than Gemini Flash-Lite, but the extraction quality and
  guardrail-following are best-in-class, which matters because a wrong event erodes trust.
- **OpenAI — GPT mini vision:** the middle. Cheap, competent vision + structured outputs, but no
  clear win over Gemini on price or over Claude on extraction discipline for this specific task.

> Note: exact per-token/per-image prices move; verify current numbers before committing spend. The
> *ranking* for this workload (Gemini cheapest, Claude highest-quality, OpenAI middle) is the stable part.

## Decision

**Keep the provider abstraction in `lib/extract.js` (hard rule: no provider hardcoding in feature
code), and route by cost + confidence:**

1. **Primary: Gemini Flash-Lite** for the bulk of scans — cheapest at scale, strong German OCR, free
   tier covers the whole prototype/validation phase.
2. **Fallback: Claude Haiku** for low-confidence extractions (any field confidence < ~0.6) or when
   Gemini returns `is_event:false` on something that looks like a poster — pay for quality only on the
   hard ones.

Rationale: the scan feature is high-volume and cost-sensitive, so optimize the common case for price
(Gemini) while protecting trust on the hard case with quality (Claude). We already built and tested
the pipeline on Claude, so Claude-only is the correct *fallback/day-one* default; the Gemini primary
is a cost optimization to add before scan volume grows.

## Consequences

- Add a `EXTRACT_PROVIDER` (gemini|anthropic) switch + a Gemini implementation in `lib/extract.js`.
- One more API key to manage (`GEMINI_API_KEY`) alongside `ANTHROPIC_API_KEY`.
- Keep the structured-output schema identical across providers so the confirm screen doesn't care
  which model produced the draft.
