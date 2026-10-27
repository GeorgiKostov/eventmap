# Scheduled crawl — no paid AI

As of 2026-10-27, `.github/workflows/crawl.yml` refreshes **Austria only**, using
`node scripts/crawl.mjs --country AT --mode structured` at **04:00 UTC daily**
(05:00 Vienna in winter, 06:00 in summer). Manual dispatch uses the same fixed mode.
The weekly paid lane, model budget and model credentials are removed.

## Behavior

- Only known deterministic sources enter the scheduled lane. JSON-LD, iCal, RSS and
  CMS adapters continue to work; source cadence, caching, geocoding, expiry and SEO
  refresh are unchanged. Germany and Bulgaria remain paused.
- AI-only and unknown-route sources stay registered but are deliberately deferred.
  Review them in Codex while George is online or add an authorized deterministic
  adapter. Do not silently mark them broken or delete their existing events.
- All automated model entrypoints in `lib/extract.js` and embeddings reject with
  `AUTOMATED_AI_DISABLED`, even with old credentials or provider overrides. Digest
  copy returns null so existing deterministic newsletter templates remain available.
- A crawl requesting an AI fallback leaves the source due, without changing its
  statistics. The process defers subsequent AI attempts; structured work continues.
- One workflow run at a time respects geocoding limits. Never run overlapping local
  crawls against the same geocoder/IP.

## Required workflow secrets

Only `DATABASE_URL` (Supabase) and `ADMIN_TOKEN` (SEO invalidation). No Gemini,
Anthropic, OpenAI or xAI credential belongs in a workflow. The newsletter workflow
also has no AI credentials and uses template copy.

## Interactive summaries

Ask Codex to review approved source facts and write summaries within the active chat,
using the existing subscription. Existing seed-compatible JSON remains the import
format; preserve source URLs, reliable dates, original descriptions and source authorization.
No API billing or unattended model/CLI fallback is authorized. This does not create a
new background automation or promise that AI-only sources refresh while George is offline.

## Verification and costs

Run the workflow guard tests and the no-AI regression tests before publishing changes.
No paid model calls are needed for testing. Existing hosting, database, mail and Actions
compute are separate services; this policy guarantees no model calls from guarded code,
not zero infrastructure billing. API usage already incurred cannot be undone.

## Troubleshooting

An empty result is not automatically success: confirm the expected parser ran and compare
against a known source. The existing systemic zero-yield alarm, recovery-probe accounting,
and per-source logs still apply. A source requiring AI is intentionally left due, not an
error to fix by adding a model key. Do not restore paid behavior without George's approval.
