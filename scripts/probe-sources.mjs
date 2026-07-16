// Deterministic source discovery: for each catalog municipality not already
// registered in `sources`, resolve its website, find the events-calendar
// page, and fingerprint the CMS — all from HTML signatures, NO LLM calls.
// Prints a proposed registration list; does NOT write to the DB (--write
// wiring is a follow-up once the output shape is reviewed).
//
// Usage: node --env-file=.env.local scripts/probe-sources.mjs --region Steiermark --limit 30
//        node --env-file=.env.local scripts/probe-sources.mjs --limit 200
//        node --env-file=.env.local scripts/probe-sources.mjs --region Tirol
//
// Politeness: reuses the crawl.mjs UA + per-host ≥1s delay + robots.txt gate
// pattern (scripts/crawl.mjs's politeFetch/parseRobots/isDisallowed aren't
// exported — crawl.mjs is mid-run in a concurrent session tonight, so this
// file re-implements the same small pattern rather than touching it).
// Global concurrency across hosts is capped independently of the per-host
// delay (see HOST_CONCURRENCY below).
import fs from 'fs';
import path from 'path';
import { listSourcesForDedup, closeDb } from '../lib/db.js';
import { decodeEntities } from '../lib/entities.js';
import { fingerprintCms, structuredSignals, looksLikeCalendar } from '../lib/cms-fingerprint.js';

const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';
const BOT_TOKEN = 'umkreisbot';
const CATALOG_PATH = path.join(process.cwd(), 'data', 'catalog', 'municipalities-at.json');
const REQUEST_TIMEOUT_MS = 6000;
const HOST_DELAY_MS = 1000;
const HOST_CONCURRENCY = 6;

// --- args ---
function parseArgs(argv) {
  const args = { region: null, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--region') args.region = argv[++i];
    else if (argv[i] === '--limit') args.limit = Number(argv[++i]) || Infinity;
  }
  return args;
}

// --- politeness: per-host delay + robots.txt (same pattern as crawl.mjs) ---
const lastFetchByHost = new Map();
async function politeFetch(url, opts = {}) {
  const u = new URL(url);
  const wait = HOST_DELAY_MS - (Date.now() - (lastFetchByHost.get(u.host) || 0));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchByHost.set(u.host, Date.now());
  return fetch(url, {
    ...opts,
    redirect: 'follow',
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function parseRobots(text) {
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
      if (current && current.disallow.length === 0 && !current.sawRule) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], disallow: [], sawRule: false };
        groups.push(current);
      }
    } else if (key === 'disallow' && current) {
      current.sawRule = true;
      if (value) current.disallow.push(value);
    }
  }
  return groups;
}
function isDisallowed(groups, pathname) {
  const group = groups.find((g) => g.agents.some((a) => a.includes(BOT_TOKEN))) || groups.find((g) => g.agents.includes('*'));
  if (!group) return false;
  return group.disallow.some((p) => p === '/' || (p && pathname.startsWith(p)));
}
const robotsCache = new Map();
async function robotsAllowed(url) {
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
  return !isDisallowed(groups, u.pathname);
}

// Robots-gated GET; returns { ok, status, url (final), html } or null.
async function politeGet(url) {
  try {
    if (!(await robotsAllowed(url))) return { ok: false, status: 0, url, html: null, blocked: true };
    const res = await politeFetch(url);
    if (!res.ok) return { ok: false, status: res.status, url: res.url, html: null };
    const html = await res.text();
    return { ok: true, status: res.status, url: res.url, html };
  } catch {
    return null;
  }
}

// --- slug guessing (only used when the catalog has no website for a town) ---
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/^st\.\s*/, 'sankt ')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip remaining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// Bundesland-specific domain patterns observed in the existing registry
// (data/sources-austria.json / data/sources-ooe.json notes).
const REGION_TLD = {
  'Oberösterreich': (slug) => `https://${slug}.ooe.gv.at/`,
  'Salzburg': (slug) => `https://www.${slug}.salzburg.at/`,
  'Tirol': (slug) => `https://www.${slug}.tirol.gv.at/`,
};
function candidateSiteUrls(muni) {
  if (muni.website) return [muni.website];
  const slug = slugify(muni.name);
  const guesses = [`https://www.${slug}.at/`, `https://www.${slug}.gv.at/`];
  const regional = REGION_TLD[muni.region];
  if (regional) guesses.push(regional(slug));
  guesses.push(`https://${slug}.at/`);
  return guesses;
}

// --- events-page candidates ---
const COMMON_PATHS = [
  '/veranstaltungen', '/Veranstaltungen', '/events', '/Events',
  '/freizeit/veranstaltungen', '/Freizeit/Veranstaltungen',
  '/Buergerservice/Veranstaltungen', '/BUeRGERSERVICE/AKTUELLES/Veranstaltungen',
  '/Leben_in_der_Gemeinde/Veranstaltungen', '/Unsere_Gemeinde/Veranstaltungen',
];
// href attribute values are HTML-entity-encoded in the markup (query strings
// commonly carry "&amp;") — decode before resolving or "&amp;menuonr=" turns
// into a literal "amp;menuonr" param, silently breaking RIS/GEM2GO deep links.
function extractHrefs(html, base) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => decodeEntities(m[1]));
  const abs = [];
  for (const h of hrefs) {
    try { abs.push(new URL(h, base).toString()); } catch { /* skip */ }
  }
  return abs;
}
// False-positive doctrine (briefs/mining-brief.md): URL must contain
// "veranstalt", a bare "termine" page is usually waste-collection dates.
function scoreEventUrl(url) {
  if (/veranstalt/i.test(url)) return 2;
  if (/event/i.test(url)) return 1;
  if (/termine/i.test(url)) return 0; // still tried, but ranked last
  return -1;
}
function eventPageCandidates(siteUrl, html) {
  const origin = new URL(siteUrl).origin;
  // Links actually found on the homepage are real (confirmed to exist) —
  // try those before blind common-path guesses, which are mostly 404s on
  // any site that isn't using one of those exact conventions. Equal-score
  // ties keep insertion order (stable sort), so ordering here matters.
  const fromLinks = extractHrefs(html, siteUrl).filter((u) => /veranstalt|termine|events/i.test(u));
  const fromPaths = COMMON_PATHS.map((p) => origin + p);
  const all = [...new Set([...fromLinks, ...fromPaths])];
  return all
    .map((u) => ({ url: u, score: scoreEventUrl(u) }))
    .filter((c) => c.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((c) => c.url);
}

// CMS fingerprint + structured-signal detection now live in
// lib/cms-fingerprint.js (extracted 2026-07-16 so scripts/fingerprint-sources.mjs
// can reuse the exact same markers instead of hand-rolling a second copy).
// Note: that module's fingerprintCms() no longer classifies the bare
// `/system/web/*.aspx?menuonr=` URL pattern as cms='ris' — HTML-level
// verification (2026-07-16 fingerprint sweep) showed those pages render the
// identical gem2go markup, so they're classified 'gem2go' there instead.

// --- async pool ---
async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

async function probeMunicipality(muni) {
  const out = { name: muni.name, region: muni.region, town: muni.name, url: null, cms: null, confidence: 'low', notes: [] };

  // 1. resolve website
  const siteCandidates = candidateSiteUrls(muni);
  let site = null;
  for (const candidate of siteCandidates) {
    const res = await politeGet(candidate);
    if (res && res.ok && res.html && res.html.length > 200) { site = res; break; }
  }
  if (!site) {
    out.notes.push(`no working site found (tried ${siteCandidates.length}: ${siteCandidates.join(', ')})`);
    return out;
  }
  out.homepage = site.url;
  const guessed = !muni.website;

  // 2. find events page
  const candidates = eventPageCandidates(site.url, site.html);
  let eventPage = null;
  let weakFallback = null;
  for (const url of candidates.slice(0, 8)) {
    const res = await politeGet(url);
    if (!res || !res.ok || !res.html) continue;
    if (looksLikeCalendar(res.html)) { eventPage = res; break; }
    if (!weakFallback) weakFallback = res; // page exists but no date-ish content confirmed yet
  }
  if (!eventPage) eventPage = weakFallback;

  const page = eventPage && eventPage.html.length > 200 ? eventPage : site;
  const fp = fingerprintCms(page.html, page.url);
  const signals = structuredSignals(page.html);

  out.url = eventPage ? eventPage.url : null;
  out.cms = fp ? fp.cms : (signals.jsonld || signals.ical || signals.rss ? 'other' : (eventPage ? 'unknown' : null));
  if (fp) out.notes.push(`CMS fingerprint: ${fp.signal}`);
  if (signals.jsonld) out.notes.push('JSON-LD Event block present');
  if (signals.ical) out.notes.push('iCal link present');
  if (signals.rss) out.notes.push('RSS/Atom feed link present');

  if (!eventPage) {
    out.notes.push('no events-calendar page found on homepage or common paths');
    out.confidence = 'low';
  } else if (fp || signals.jsonld || signals.ical) {
    out.confidence = guessed ? 'medium' : 'high';
  } else if (looksLikeCalendar(eventPage.html)) {
    out.confidence = guessed ? 'low' : 'medium';
  } else {
    out.confidence = 'low';
  }
  if (guessed) out.notes.push('website guessed from name pattern, not in catalog');

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf-8'));
  let munis = catalog.municipalities;
  if (args.region) {
    munis = munis.filter((m) => m.region.toLowerCase() === args.region.toLowerCase());
    if (!munis.length) {
      console.error(`No catalog entries for region "${args.region}". Known regions: ${[...new Set(catalog.municipalities.map((m) => m.region))].join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Catalog: ${munis.length} municipalities${args.region ? ` in ${args.region}` : ' (all Bundesländer)'}`);

  // Read-only dedup check against already-registered sources.
  const existing = await listSourcesForDedup();
  const existingDomains = new Set();
  const existingNames = new Set();
  for (const s of existing) {
    try { existingDomains.add(new URL(s.url).hostname.replace(/^www\./, '').toLowerCase()); } catch { /* skip */ }
    if (s.name) existingNames.add(s.name.trim().toLowerCase());
    if (s.town) existingNames.add(s.town.trim().toLowerCase());
  }
  console.log(`Registry: ${existing.length} sources already registered`);

  const candidates = munis.filter((m) => {
    if (existingNames.has(m.name.trim().toLowerCase())) return false;
    if (m.website) {
      try { if (existingDomains.has(new URL(m.website).hostname.replace(/^www\./, '').toLowerCase())) return false; } catch { /* keep */ }
    }
    return true;
  });
  const toProbe = candidates.slice(0, args.limit);
  console.log(`Not yet registered: ${candidates.length} — probing ${toProbe.length} (limit ${args.limit === Infinity ? 'none' : args.limit})\n`);

  const started = Date.now();
  const results = await pool(toProbe, HOST_CONCURRENCY, probeMunicipality);
  const elapsedMs = Date.now() - started;

  // --- summary ---
  const withEventsPage = results.filter((r) => r.url);
  const cmsCount = {};
  for (const r of results) cmsCount[r.cms || 'none'] = (cmsCount[r.cms || 'none'] || 0) + 1;
  const confCount = {};
  for (const r of results) confCount[r.confidence] = (confCount[r.confidence] || 0) + 1;
  const noSite = results.filter((r) => !r.homepage).length;

  console.log('--- Summary ---');
  console.log(`Probed: ${results.length}`);
  console.log(`Website resolved: ${results.length - noSite} / ${results.length}`);
  console.log(`Events page found: ${withEventsPage.length} / ${results.length}`);
  console.log('CMS distribution:', cmsCount);
  console.log('Confidence distribution:', confCount);
  console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / results.length).toFixed(0)}ms/municipality avg)`);

  const regionSlug = args.region ? args.region.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'all';
  const outPath = path.join(process.cwd(), 'data', 'catalog', `probed-${regionSlug}-${results.length}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    _meta: {
      region: args.region || 'all', probed_at: new Date().toISOString(), count: results.length,
      elapsed_ms: elapsedMs, cms_distribution: cmsCount, confidence_distribution: confCount,
      note: 'Proposed registrations — NOT written to the DB. Review, then wire a --write path onto upsertSource() (which currently has no `region` param — see docs/design/data-pipeline.md §2/§11 gap).',
    },
    proposed: results,
  }, null, 2), 'utf-8');
  console.log(`\nWrote ${outPath}`);

  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
