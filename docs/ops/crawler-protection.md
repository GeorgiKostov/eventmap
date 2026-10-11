# Targeted crawler protection

## September 10, 2026 invocation anomaly

Vercel attributed the temporary invocation spike to PerplexityBot bursts on `/event/[id]`.
SE Ranking's backlink crawler supplied steady background traffic (about 14,700 requests in
the dashboard's preceding day). The alert resolved without application errors. George then
authorized implementing blocks or reductions for this traffic.

## Live control

Vercel project `eventmap` has one enabled custom rule, **Limit identified bulk crawlers**,
ID `rule_limit_identified_bulk_crawlers_cbypHn`. Its action is **Deny**, without a persistent
IP action. It matches case-insensitive User-Agent product tokens `PerplexityBot` and
`SERankingBacklinksBot` across project paths and environments. These are the actual header
tokens; the alert's `seranking-backlinks` label is not the SE Ranking header token.

The saved expression is:

```text
(^|[ (;])([pP][eE][rR][pP][lL][eE][xX][iI][tT][yY][bB][oO][tT]|[sS][eE][rR][aA][nN][kK][iI][nN][gG][bB][aA][cC][kK][lL][iI][nN][kK][sS][bB][oO][tT])([/ ;)]|$)
```

The firewall rejects matching requests before application execution. This configuration is
stored in Vercel, not in application middleware, and takes effect without an app deployment.
No paid rate limiting or managed ruleset was enabled. Vercel documents custom rules as free
and denies as exempt from CDN request and transfer charges:
[WAF pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing).

Tradeoff: automatic Perplexity indexing and SE Ranking backlink crawling cannot fetch pages.
Googlebot, Bingbot and the distinct `Perplexity-User` token do not match. This is a targeted
usage control, not protection against crawlers that disguise their User-Agent. Other crawlers
remain allowed; global Bot Protection, AI Bots and DDoS settings were not changed.

## Verification and rollback

The rule was first published in logging mode, then changed to Deny. After propagation,
live GET probes to `/event/24809` returned 403 for both actual crawler headers and 200 for
Mozilla, Googlebot, Bingbot and Perplexity-User. Homepage probes also returned 403 for
mixed/lowercase PerplexityBot and uppercase SERANKINGBACKLINKSBOT, and 200 for Mozilla.
A real browser rendered the event title, details and nearby events with no console errors.
These synthetic headers test matching, not verified ownership of those crawlers.

Review matches in the [filtered traffic view](https://vercel.com/georgikostovs-projects/eventmap/firewall/traffic?filter=rule_limit_identified_bulk_crawlers_cbypHn).
To roll back, disable this single rule in [Firewall Rules](https://vercel.com/georgikostovs-projects/eventmap/firewall/rules),
review the staged change and publish. Do not disable system mitigations. No persistent
action was added, so this rule does not leave a timed IP block after rollback.
