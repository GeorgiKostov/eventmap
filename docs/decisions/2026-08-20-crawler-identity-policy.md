# 2026-08-20 — Apply robots rules to Okolo's own crawler identity

Status: adopted · Owner: Architect.
Supersedes: `2026-07-16-ai-bot-policy.md`.

## Decision

Okolo obeys the robots.txt rules that apply to its identifying `UmkreisBot`
user-agent, falling back to the `User-agent: *` group. A rule that names only a
different crawler such as CCBot, GPTBot or ClaudeBot does not block Okolo.

This matches the permission actually published for our crawler. We continue to
identify every request, honor crawl delays and path-specific rules, index only
event facts, write original descriptions or `null`, and link every event to its
official source.

`robotsAllowed()` remains the authoritative implementation. The existing
`aiPolicyAllowed()` is retained as a compatibility alias for historical callers
and audit evidence. Crawl and registration paths now use `robotsAllowed()` directly.

## Trigger

The Austrian venue audit found that Posthof and Wiener Stadthalle allow general
crawlers while separately blocking named third-party AI/Common-Crawl agents.
George confirmed that Okolo may crawl a venue when the rules applying to our
own crawler allow it.
