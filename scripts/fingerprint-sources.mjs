// CMS fingerprint sweep: for every registered, working source still paying
// the LLM route (or never HTML-fingerprinted at all), fetch its listing URL
// and sniff for a CMS marker that maps onto an existing crawl.mjs adapter —
// converting it from a paid model call to a $0 deterministic parse on its next
// crawl. Also flags JS-only SPAs and bot-blocked pages (stop paying for pages
// that could never have been parsed) and clusters recognizable-but-unsupported
// CMSes (Joomla/jevents, WordPress event plugins, plain TYPO3, Contao, Drupal,
// Wix, ...) so the architect can see which 2-3 new adapters would pay off most.
//
// The national probe (scripts/probe-sources.mjs) classified sources from URL
// patterns alone, never fetching HTML — this sweep is the first pass that
// actually looks at the page. See docs/design/data-pipeline.md §2.
//
// Dry-run by DEFAULT: writes the full report to data/catalog/fingerprint-report.json
// and prints a summary table. Nothing is written to the DB unless --write is
// passed (applies cms + notes only — never feed_kind/page_hash, and never a
// cms value crawl.mjs doesn't already route, see lib/cms-fingerprint.js
// ROUTABLE_CMS).
//
// Usage: node --env-file=.env.local scripts/fingerprint-sources.mjs --limit 30
//        node --env-file=.env.local scripts/fingerprint-sources.mjs --country AT
//        node --env-file=.env.local scripts/fingerprint-sources.mjs --url https://...
//        node --env-file=.env.local scripts/fingerprint-sources.mjs --write   (after review)
import fs from 'fs';
import path from 'path';
import {
  getFingerprintCandidates, getSourceByUrl, updateSourceCmsFingerprint, closeDb,
} from '../lib/db.js';
import { politeFetch, robotsAllowed } from '../lib/crawl-net.js';
import {
  ROUTABLE_CMS, fingerprintCms, structuredSignals, discoverFeedHints,
  detectAdapterCandidate, detectJsSpa, detectBlocked, textLength,
} from '../lib/cms-fingerprint.js';

const HOST_CONCURRENCY = 6;
const REPORT_PATH = path.join(process.cwd(), 'data', 'catalog', 'fingerprint-report.json');

function parseArgs(argv) {
  const args = { limit: Infinity, url: null, country: null, write: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]) || Infinity;
    else if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--country') args.country = argv[++i];
    else if (argv[i] === '--write') args.write = true;
  }
  return args;
}

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

// One source -> a proposed-update record. Never throws: every failure mode
// (robots block, fetch error, timeout) becomes a `blockedReason`/`notes`
// entry rather than aborting the sweep.
async function fingerprintSource(src) {
  const out = {
    id: src.id, name: src.name, url: src.url,
    current: { cms: src.cms ?? null, feed_kind: src.feed_kind ?? null },
    proposed: {}, evidence: null, feedUrl: undefined, blockedReason: undefined,
    bucket: null, // 'routed' | 'already-routable-gap' | 'structured-signal' | 'adapter-candidate' | 'js-spa' | 'blocked' | 'no-signal'
  };

  let allowed = true;
  try { allowed = await robotsAllowed(src.url); } catch { allowed = true; }
  if (!allowed) {
    out.blockedReason = 'robots.txt disallows';
    out.bucket = 'blocked';
    return out;
  }

  let res;
  try {
    res = await politeFetch(src.url);
  } catch (e) {
    out.blockedReason = `fetch failed: ${e.message}`;
    out.bucket = 'blocked';
    return out;
  }

  let html = '';
  try { html = await res.text(); } catch { /* leave empty */ }

  const blockReason = detectBlocked(res.status, html);
  if (blockReason) {
    out.blockedReason = `${blockReason} (status ${res.status})`;
    out.bucket = 'blocked';
    return out;
  }
  if (!res.ok) {
    out.blockedReason = `http ${res.status}`;
    out.bucket = 'blocked';
    return out;
  }
  if (!html || html.length < 200) {
    out.blockedReason = 'empty/near-empty response';
    out.bucket = 'blocked';
    return out;
  }

  if (detectJsSpa(html)) {
    out.bucket = 'js-spa';
    out.notes = `js-spa: rendered text ${textLength(html)} chars, client-mount marker present`;
    return out;
  }

  const fp = fingerprintCms(html, res.url || src.url);
  if (fp && ROUTABLE_CMS.has(fp.cms)) {
    out.evidence = fp.signal;
    if (fp.cms !== out.current.cms) {
      out.proposed.cms = fp.cms;
      out.bucket = 'routed';
    } else {
      // Already tagged correctly, yet still on the LLM route (or never
      // crawled) — the adapter exists and the tag is right, but either this
      // page's specific markup variant isn't matched by the parser, or it's
      // simply not been crawled since being tagged. Not a cms proposal; a
      // parser-gap/recrawl flag instead. This is the cms=gem2go/feed_kind=llm
      // population the brief asked about (2026-07-16 investigation, see
      // report notes).
      out.bucket = 'already-routable-gap';
      out.notes = out.current.feed_kind === 'llm'
        ? 'cms already correct; adapter did not match this page (possible markup variant gap)'
        : 'cms already correct; not yet (re)crawled since tagging';
    }
  } else {
    const signals = structuredSignals(html);
    if (signals.jsonld || signals.microdata || signals.ical || signals.rss) {
      out.bucket = 'structured-signal';
      out.signals = signals;
      out.notes = `listing page carries ${Object.entries(signals).filter(([, v]) => v).map(([k]) => k).join('+')} — not cms-gated, should auto-route; check why last feed_kind was '${out.current.feed_kind}'`;
    } else {
      const candidate = detectAdapterCandidate(html);
      if (candidate) {
        out.bucket = 'adapter-candidate';
        out.adapterCandidate = candidate.key;
        out.notes = candidate.label;
      } else {
        out.bucket = 'no-signal';
      }
    }
  }

  const feedHints = discoverFeedHints(html, res.url || src.url);
  if (feedHints.length) out.feedUrl = feedHints[0].url, out.feedHints = feedHints.slice(0, 3);

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let candidates;
  if (args.url) {
    const rows = await getSourceByUrl(args.url);
    if (!rows.length) {
      console.error(`No registered source with url=${args.url}`);
      process.exit(1);
    }
    candidates = rows;
  } else {
    candidates = await getFingerprintCandidates({ country: args.country });
  }
  const toRun = candidates.slice(0, args.limit);

  console.log(`Target set: ${candidates.length} sources${args.country ? ` (country=${args.country})` : ''} — fingerprinting ${toRun.length}${args.limit !== Infinity ? ` (limit ${args.limit})` : ''}`);
  console.log(args.write ? 'MODE: --write (will apply cms/notes updates)' : 'MODE: dry-run (no DB writes)');

  const started = Date.now();
  const results = await pool(toRun, HOST_CONCURRENCY, fingerprintSource);
  const elapsedMs = Date.now() - started;

  // --- summary ---
  const bucketCount = {};
  const proposedCmsCount = {};
  const adapterClusterCount = {};
  const adapterClusterExamples = {};
  const signalCount = { jsonld: 0, microdata: 0, ical: 0, rss: 0 };
  const signalExamples = { jsonld: [], microdata: [], ical: [], rss: [] };
  for (const r of results) {
    bucketCount[r.bucket || 'error'] = (bucketCount[r.bucket || 'error'] || 0) + 1;
    if (r.proposed?.cms) proposedCmsCount[r.proposed.cms] = (proposedCmsCount[r.proposed.cms] || 0) + 1;
    if (r.bucket === 'adapter-candidate') {
      adapterClusterCount[r.adapterCandidate] = (adapterClusterCount[r.adapterCandidate] || 0) + 1;
      (adapterClusterExamples[r.adapterCandidate] ||= []).push(r.url);
    }
    if (r.signals) for (const [k, v] of Object.entries(r.signals)) {
      if (v) { signalCount[k]++; if (signalExamples[k].length < 3) signalExamples[k].push(r.url); }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Fingerprinted: ${results.length} in ${(elapsedMs / 1000).toFixed(0)}s (${(elapsedMs / results.length).toFixed(0)}ms/source avg)`);
  console.log('\nBy bucket:');
  for (const [k, v] of Object.entries(bucketCount).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log('\nStructured signals on LLM-route sources (should auto-route to $0 on next crawl):');
  for (const [k, v] of Object.entries(signalCount).filter(([, v]) => v).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v} — e.g. ${signalExamples[k].slice(0, 2).join(', ')}`);
  }
  console.log('\nProposed cms changes (routable, applied only with --write):');
  if (Object.keys(proposedCmsCount).length === 0) console.log('  (none)');
  for (const [k, v] of Object.entries(proposedCmsCount).sort((a, b) => b[1] - a[1])) console.log(`  -> ${k}: ${v}`);
  console.log('\nAdapter-candidate clusters (no existing adapter — new-adapter ROI signal):');
  if (Object.keys(adapterClusterCount).length === 0) console.log('  (none)');
  for (const [k, v] of Object.entries(adapterClusterCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v} — e.g. ${adapterClusterExamples[k].slice(0, 2).join(', ')}`);
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    _meta: {
      run_at: new Date().toISOString(), target_set_size: candidates.length, fingerprinted: results.length,
      elapsed_ms: elapsedMs, mode: args.write ? 'write' : 'dry-run',
      bucket_counts: bucketCount, proposed_cms_counts: proposedCmsCount,
      adapter_candidate_counts: adapterClusterCount, adapter_candidate_examples: adapterClusterExamples,
    },
    results,
  }, null, 2), 'utf-8');
  console.log(`\nWrote ${REPORT_PATH}`);

  if (args.write) {
    let applied = 0;
    for (const r of results) {
      if (r.proposed?.cms) {
        await updateSourceCmsFingerprint(r.id, { cms: r.proposed.cms, notes: r.evidence ? `Fingerprint sweep 2026-07-16: ${r.evidence}` : undefined });
        applied++;
      }
    }
    console.log(`Applied ${applied} cms update(s) to the DB.`);
  } else {
    console.log('Dry-run: no DB writes. Re-run with --write after review to apply cms updates.');
  }

  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
