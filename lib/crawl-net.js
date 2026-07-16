// Shared polite-fetch + robots.txt layer for every crawler-side script
// (scripts/crawl.mjs, scripts/enrich-locations.mjs). Legal hygiene lives here:
// identifying UA, per-host ≥1s delay (raised to a parsed Crawl-delay), and
// RFC-9309 robots checking. Extracted from scripts/crawl.mjs 2026-07-14 so the
// location-enrichment second hop reuses the exact same politeness machinery.

// Identifying UA for the whole crawl path (legal hygiene — polite citizen).
// lib/geocode.js keeps its own Nominatim UA per that service's usage policy.
export const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';
const BOT_TOKEN = 'umkreisbot';

// --- per-host politeness + robots.txt ---
const HOST_DELAY_MS = 1000;
const lastFetchByHost = new Map();
const robotsCache = new Map(); // origin -> parsed rule groups
const robotsDelayByHost = new Map();

export async function politeFetch(url, opts = {}) {
  const u = new URL(url);
  const delay = Math.max(HOST_DELAY_MS, robotsDelayByHost.get(u.host) || 0);
  const wait = delay - (Date.now() - (lastFetchByHost.get(u.host) || 0));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchByHost.set(u.host, Date.now());
  return fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(20000),
  });
}

// Groups consecutive "User-agent:" lines (no rule seen yet) into one rule
// set, per RFC 9309's common-case grouping. Good enough for our two agents
// (our UA and "*") — not a full robots.txt implementation.
// "Allow:" MUST count as a rule here: Cloudflare's managed robots layout is
// `User-agent: * / Allow: /` immediately followed by named AI-bot blocks
// (`User-agent: GPTBot / Disallow: /`, ...). Ignoring Allow left the `*`
// group "empty", merged the first named bot into it, and made the entire
// site look disallowed for everyone — the false block that zeroed Stuttgart.
export function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (current && !current.sawRule) {
        current.agents.push(value.toLowerCase());
      } else {
        current = {
          agents: [value.toLowerCase()], disallow: [], allow: [],
          crawlDelayMs: null, requestRateDelayMs: null, sawRule: false,
        };
        groups.push(current);
      }
    } else if (key === 'disallow' && current) {
      current.sawRule = true;
      if (value) current.disallow.push(value);
    } else if (key === 'allow' && current) {
      current.sawRule = true;
      if (value) current.allow.push(value);
    } else if (key === 'crawl-delay' && current) {
      current.sawRule = true;
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) current.crawlDelayMs = Math.min(seconds * 1000, 60000);
    } else if (key === 'request-rate' && current) {
      // "Request-rate: N/S" (Austrian diocese sites: "1/30") -> S/N seconds
      // between requests, same 60s cap as crawl-delay. Malformed/zero N -> ignored.
      current.sawRule = true;
      const m = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([smh]?)$/i);
      if (m) {
        const n = Number(m[1]);
        let s = Number(m[2]);
        const unit = m[3].toLowerCase();
        if (unit === 'm') s *= 60; else if (unit === 'h') s *= 3600;
        if (n > 0 && s > 0) current.requestRateDelayMs = Math.min((s / n) * 1000, 60000);
      }
    }
  }
  return groups;
}

// A robots.txt may contain several groups for the same agent token (Stuttgart
// has two `User-agent: *` blocks — Cloudflare's and the site's own). Per
// RFC 9309 their rules apply as a union, so merge every matching group rather
// than taking the first.
export function matchingRobotsGroup(groups) {
  // When several groups name our bot, the strictest published delay wins — same
  // policy robotsAllowed applies across the two directive KINDS. First-wins here
  // would let a lax group override a stricter one that also names us.
  const maxOrNull = (vals) => {
    const f = vals.filter((v) => v != null);
    return f.length ? Math.max(...f) : null;
  };
  const merge = (pred) => {
    const matched = groups.filter(pred);
    if (!matched.length) return null;
    return {
      disallow: matched.flatMap((g) => g.disallow),
      allow: matched.flatMap((g) => g.allow),
      crawlDelayMs: maxOrNull(matched.map((g) => g.crawlDelayMs)),
      requestRateDelayMs: maxOrNull(matched.map((g) => g.requestRateDelayMs)),
    };
  };
  return merge((g) => g.agents.some((a) => a.includes(BOT_TOKEN)))
    || merge((g) => g.agents.includes('*'))
    || null;
}

// RFC 9309 path matching: `*` matches any run of characters, a trailing `$`
// anchors the end of the path; everything else is literal. Precedence is the
// longest (most specific) matching rule; on an allow/disallow length tie, allow
// wins. A rule like `Disallow: /*.pdf$` used to be kept literally (containing a
// '*'/'$' that startsWith could never match) and silently treated as absent —
// fail-OPEN on a hard-rule-7 surface. Now it's honoured.
function robotsRuleMatch(pattern, pathname) {
  if (!pattern) return 0; // empty Disallow/Allow = matches nothing
  let body = pattern;
  let anchored = false;
  if (body.endsWith('$')) { anchored = true; body = body.slice(0, -1); }
  const re = new RegExp(
    '^' + body.split('*').map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''),
  );
  // Specificity = length of the rule pattern (RFC 9309 §2.2.2), so `/events/x`
  // outranks `/events`, and `*`/`$` count toward length like real octets.
  return re.test(pathname) ? pattern.length : 0;
}

export function isDisallowed(group, pathname) {
  if (!group) return false;
  const longest = (rules) => rules.reduce((max, p) => Math.max(max, robotsRuleMatch(p, pathname)), 0);
  const d = longest(group.disallow);
  return d > 0 && d > longest(group.allow); // allow wins on a length tie (RFC 9309)
}

// One fetch+parse per origin, shared by robotsAllowed and aiPolicyAllowed so
// asking both questions costs one robots.txt, not two.
async function robotsGroups(origin) {
  let groups = robotsCache.get(origin);
  if (!groups) {
    groups = [];
    try {
      const res = await politeFetch(`${origin}/robots.txt`);
      if (res.ok) groups = parseRobots(await res.text());
    } catch { /* no robots.txt / fetch failed → default allow */ }
    robotsCache.set(origin, groups);
  }
  return groups;
}

// AI/LLM crawlers we treat as speaking for us when a site names them (George,
// 2026-07-16 — docs/decisions/2026-07-16-ai-bot-policy.md).
//
// DELIBERATELY ABSENT — do not "complete" this list without re-reading the doc:
//   petalbot (Huawei), amazonbot — SEARCH-engine crawlers, not AI agents.
//     Including them in the first measurement wrongly condemned Linz-Termine
//     (42 live events) and 9 others; a search crawler saying no says nothing
//     about AI indexing.
//   bytespider — berlin.de lists it beside AwarioSmartBot and cookiebot while
//     naming no AI bot at all: that is a nuisance-scraper list, not an AI
//     stance. George's explicit call; it costs us nothing, since bytespider
//     blocks no registered source.
export const AI_BOT_TOKENS = [
  'claudebot', 'anthropic-ai', 'claude-web',
  'gptbot', 'chatgpt-user', 'oai-searchbot',
  'ccbot', 'google-extended', 'perplexitybot', 'perplexity-user',
  'applebot-extended', 'cohere-ai', 'cohere-training-data-crawler',
  'meta-externalagent', 'meta-externalfetcher', 'ai2bot',
  'omgili', 'omgilibot', 'diffbot', 'imagesift', 'img2dataset',
  'youbot', 'timpibot', 'webzio-extended',
];

// Our standing policy (CLAUDE.md; the Wien precedent with Büchereien/VHS Wien):
// a site that names an AI crawler and closes the door on it has told us what it
// wants, even though `UmkreisBot` is never on the list.
//
// This is a SEPARATE question from robotsAllowed() on purpose. RFC 9309 says
// those hosts do allow us — robotsAllowed() returns true for stuttgart.de and
// it is RIGHT to. Folding this into the parser would corrupt a spec
// implementation with a product policy, and would re-create the exact bug that
// zeroed Stuttgart in 2026-07-14 (a named AI-bot group bleeding into the `*`
// group). Two questions, two functions.
//
// Groups naming AI bots are merged and evaluated as one rule set (same union
// semantics as matchingRobotsGroup), so a site that disallows GPTBot but
// explicitly allows ClaudeBot resolves to allowed (allow wins on a length tie,
// RFC 9309) rather than blocked. Pure — returns null when no AI bot is named.
export function aiBotGroup(groups) {
  const matched = groups.filter((g) => (
    g.agents.some((a) => AI_BOT_TOKENS.some((t) => a.includes(t)))
  ));
  if (!matched.length) return null;
  return {
    disallow: matched.flatMap((g) => g.disallow),
    allow: matched.flatMap((g) => g.allow),
    named: [...new Set(matched.flatMap((g) => g.agents)
      .filter((a) => AI_BOT_TOKENS.some((t) => a.includes(t))))],
  };
}

export async function aiPolicyAllowed(url) {
  const u = new URL(url);
  return !isDisallowed(aiBotGroup(await robotsGroups(u.origin)), u.pathname);
}

export async function robotsAllowed(url) {
  const u = new URL(url);
  const groups = await robotsGroups(u.origin);
  const group = matchingRobotsGroup(groups);
  // Effective per-host delay is the strictest of the two directives a site may
  // publish together (Austrian dioceses: Crawl-delay 10 + Request-rate 1/30 ->
  // 30s wins), never below the baseline HOST_DELAY_MS floor applied in politeFetch.
  const effectiveDelay = Math.max(group?.crawlDelayMs || 0, group?.requestRateDelayMs || 0);
  if (effectiveDelay) robotsDelayByHost.set(u.host, effectiveDelay);
  return !isDisallowed(group, u.pathname);
}
