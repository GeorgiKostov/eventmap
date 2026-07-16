# 2026-07-16 — Named-AI-crawler robots policy, enforced in code

Status: adopted + shipped (George's calls, this date) · Owner: Architect.
Companions: `docs/decisions/2026-07-11-crawl-scaling-and-legal.md` (the posture this serves),
`docs/design/big-city-quality.md` §2 (`blocked_reason` as a state).

## The policy

If a site's robots.txt **names an AI/LLM crawler and closes the door on it**, we do not crawl that
site — even though `UmkreisBot` is never on the list and RFC 9309 therefore permits us. Naming
ClaudeBot/GPTBot is the clearest statement of intent a webmaster can make with the tools they have;
"you didn't name *me* specifically" is lawyering, not consent.

This was our stated policy since the Wien precedent (Büchereien Wien / VHS Wien, 2026-07-12). Until
today **nothing implemented it** — `ai_bot_policy` existed only as a `blocked_reason` value set by
hand. `robotsAllowed()` returned `true` for every such host, so any probe/gap-fill run that
registered one would have had the cron crawl it nightly, against our own rule. Germany surfaced it:
`www.falkensee.de` and `www.teltow.de` publish a byte-identical 92-line robots.txt naming ClaudeBot
and GPTBot, with **no `User-agent: *` group at all**.

## What we measured before changing anything

Full read-only sweep, 2026-07-16: robots.txt fetched for all **1,656 unique hosts** behind our
1,731 working sources, parsed with our own `parseRobots`. 11 hosts unreachable → counted as unknown,
never as blocked.

| Variant | Sources blocked | Events |
|---|---:|---:|
| A — Anthropic bots only (claudebot/anthropic-ai/claude-web) | 9 | 206 |
| **B — any AI/LLM crawler** ← **adopted** | **11** | 208 |
| C — B + bytespider | 11 | 208 (identical to B) |

Every blocking group is a **dedicated 1-agent block** (`User-agent: ClaudeBot` / `Disallow: /`) —
deliberate intent, not an accident of grouping. Real cost: **11 source rows / 9 distinct
`source_name`s / 138 published events** (BG 69, DE 67, AT 2).

**A measurement error worth remembering.** The first pass counted `petalbot` (Huawei search) and
`amazonbot` as AI crawlers. They are **search-engine** crawlers. That falsely condemned
**Linz-Termine** (42 live events, a tier-2 source in `lib/source-quality.js`), Lang, and 8 others —
Austria's real exposure is 2 sources / 2 events, not 11 / 50+. A search crawler saying no says
nothing about AI indexing. `AI_BOT_TOKENS` carries a comment forbidding their re-addition.

## George's three calls

1. **Variant B, not A.** A site that blocks GPTBot + CCBot + Perplexity but happens not to list
   ClaudeBot has not invited us — it just hasn't updated its list.
2. **A bytespider-only list is NOT an AI stance.** `www.berlin.de` names `Bytespider` beside
   `AwarioSmartBot` and `cookiebot` and names **no** AI bot: that is a nuisance-scraper list. Reading
   it as an AI block would have cost Berlin's official portal (3 sources, the best $0 JSON-LD find of
   the German sweep) for zero policy gain — it blocks nothing currently registered (B ≡ C).
3. **Stuttgart: honor it, and ask.** `www.stuttgart.de` carries a bare `User-agent: ClaudeBot /
   Disallow: /`. It was the biggest city in the DE scope at 92 extracted / 67 published events, and
   we were crawling it nightly in violation of our own rule. Now `ai_bot_policy`, events
   `status='removed'`, and stuttgart.de is an outreach target (`docs/partnerships/README.md` §3) —
   we give linkback and we are not a training crawler, so they may well say yes if asked.

## How it is implemented

- **`aiPolicyAllowed(url)` in `lib/crawl-net.js`** — deliberately a *separate function* from
  `robotsAllowed()`. RFC 9309 genuinely does permit us on these hosts, and `robotsAllowed()` is right
  to say so. Folding a product policy into a spec implementation is what caused the 2026-07-14
  Stuttgart false-block (a named AI-bot group bleeding into the `*` group). Two questions, two
  functions. Groups naming AI bots merge into one rule set, so an explicit `ClaudeBot: Allow: /`
  beats another bot's `Disallow: /`, and a **scoped** AI block only covers the paths it names.
  `aiBotGroup()` is pure and unit-tested; `robotsGroups()` shares one robots.txt fetch per origin
  between both checks.
- **`scripts/crawl.mjs`** asks both questions at each of its two fetch gates. A policy skip sets
  `blocked_reason='ai_bot_policy'` and **leaves crawl stats untouched** — a state, never a
  `zero_streak` bump (lesson 2026-07-14: skip-reasons are states, not failure streaks).
- **`ai_bot_policy` is now auto-derived**, so it joins `robots` in `AUTO_DERIVED_BLOCKS`: it
  **self-clears** the moment a site drops the rule. `js_spa`/`bot_block` stay human/sweep judgements
  no crawl can re-evaluate. The comment at both gates asserting ai_bot_policy is "never auto-detected
  here" was updated — it would otherwise have been a comment stating the opposite of the code.
- **`works` stays `true`** on blocked sources. `works=false` + a note is the rot pattern hard rule 7
  exists to forbid; `blocked_reason` is the state, and `scripts/rot-report.mjs` surfaces it.
- Events use `status='removed'` (reversible, same status as George's test event), **not** `expired` —
  that would claim the date passed, which is false. Beyond courtesy this is a data-quality call: a
  source we can no longer refresh goes stale, and a cancelled-but-still-shown event is exactly what
  hard rule 5 exists to prevent.

## Known gaps (deliberate, not oversights)

- `scripts/fingerprint-sources.mjs` and `scripts/enrich-locations.mjs` fetch source pages and do
  **not** yet ask `aiPolicyAllowed()`. Both are manual, currently-parked tools, not the nightly cron
  — the violation the policy actually cared about was the unattended daily crawl. Add the one-line
  check before either is next run at scale.
- `scripts/probe-sources.mjs` re-implements its own robots parser and is likewise unaware. Any future
  German municipal probe must apply this policy at **discovery** time or it will keep proposing
  sources we may not crawl (the Brandenburg template repeats across municipalities).
