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
  const merge = (pred) => {
    const matched = groups.filter(pred);
    if (!matched.length) return null;
    return {
      disallow: matched.flatMap((g) => g.disallow),
      allow: matched.flatMap((g) => g.allow),
      crawlDelayMs: matched.map((g) => g.crawlDelayMs).find((d) => d != null) ?? null,
      requestRateDelayMs: matched.map((g) => g.requestRateDelayMs).find((d) => d != null) ?? null,
    };
  };
  return merge((g) => g.agents.some((a) => a.includes(BOT_TOKEN)))
    || merge((g) => g.agents.includes('*'))
    || null;
}

// RFC 9309 precedence: the longest matching rule wins; on an allow/disallow
// tie, allow wins. Patterns are treated as prefixes (a trailing '*' is
// equivalent and stripped); interior wildcards/'$' stay unsupported, as before.
export function isDisallowed(group, pathname) {
  if (!group) return false;
  const longest = (rules) => rules.reduce((max, p) => {
    const prefix = p.endsWith('*') ? p.slice(0, -1) : p;
    return prefix && pathname.startsWith(prefix) && prefix.length > max ? prefix.length : max;
  }, 0);
  const d = longest(group.disallow);
  return d > 0 && d > longest(group.allow);
}

export async function robotsAllowed(url) {
  const u = new URL(url);
  let groups = robotsCache.get(u.origin);
  if (!groups) {
    groups = [];
    try {
      const res = await politeFetch(`${u.origin}/robots.txt`);
      if (res.ok) groups = parseRobots(await res.text());
    } catch { /* no robots.txt / fetch failed → default allow */ }
    robotsCache.set(u.origin, groups);
  }
  const group = matchingRobotsGroup(groups);
  // Effective per-host delay is the strictest of the two directives a site may
  // publish together (Austrian dioceses: Crawl-delay 10 + Request-rate 1/30 ->
  // 30s wins), never below the baseline HOST_DELAY_MS floor applied in politeFetch.
  const effectiveDelay = Math.max(group?.crawlDelayMs || 0, group?.requestRateDelayMs || 0);
  if (effectiveDelay) robotsDelayByHost.set(u.host, effectiveDelay);
  return !isDisallowed(group, u.pathname);
}
