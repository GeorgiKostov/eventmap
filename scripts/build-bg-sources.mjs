// Build a durable, fingerprinted Bulgarian source catalog from the Grok crawl
// output, so `npm run crawl` can recrawl BG on a cadence (like Austria's
// probe→register→crawl loop). Reads every data/mined/events-bg-*.json, collects
// the listing/calendar pages that actually yielded events, collapses weekly
// dated permalinks to their stable section index, fingerprints each page
// (JSON-LD / iCal / RSS — same signals as scripts/probe-sources.mjs), and
// writes data/catalog/probed-bg.json in the { proposed: [...] } shape that
// scripts/register-probed.mjs consumes.
//
// Usage: node scripts/build-bg-sources.mjs
import fs from 'fs';
import path from 'path';

const UA = 'UmkreisBot/0.1 (+https://umkreis-eventmap.vercel.app; event facts indexing with linkback; contact: bobojojok@gmail.com)';
const MINED = path.join(process.cwd(), 'data', 'mined');
const OUT = path.join(process.cwd(), 'data', 'catalog', 'probed-bg.json');
const TIMEOUT_MS = 7000;

// A URL whose LAST path segment encodes a date (a weekly "културен афиш" post)
// is not a stable recrawl target — collapse it to origin + first two path
// segments (the section index), which stays put week to week.
const DATED = /(\d{2}[-.]\d{2}[-.]\d{4})|(\d{4}[-/]\d{2})|((yanuari|fevruari|mart|april|may|yuni|yuli|avgust|septemvri|oktomvri|noemvri|dekemvri)[a-z-]*20\d\d)|(-20\d\d-?g?$)/i;
function stableUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  const segs = u.pathname.split('/').filter(Boolean);
  const last = segs[segs.length - 1] || '';
  if (DATED.test(last) && segs.length > 1) {
    return `${u.origin}/${segs.slice(0, 2).join('/')}`;
  }
  return `${u.origin}${u.pathname}`.replace(/\/$/, '') || u.origin;
}
const mode = (arr) => {
  const c = {}; let best = null, bn = 0;
  for (const v of arr) { if (v == null) continue; c[v] = (c[v] || 0) + 1; if (c[v] > bn) { bn = c[v]; best = v; } }
  return best;
};

// --- 1. collect sources that produced events ---
const files = fs.readdirSync(MINED).filter((f) => /^events-bg-.*\.json$/.test(f));
const groups = new Map(); // stableUrl -> { urls:Set, ev:count, towns:[], oblasts:[], names:[] }
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(MINED, f), 'utf8'));
  for (const e of d.events || []) {
    const s = stableUrl(e.source_url); if (!s) continue;
    if (!groups.has(s)) groups.set(s, { urls: new Set(), ev: 0, towns: [], oblasts: [], names: [] });
    const g = groups.get(s);
    g.urls.add(e.source_url); g.ev++; g.towns.push(e.town); g.oblasts.push(e.oblast); g.names.push(e.source_name);
  }
}

// --- 2. fingerprint each stable source (JSON-LD / iCal / RSS) ---
function fingerprint(html) {
  const jsonld = /<script[^>]+application\/ld\+json/i.test(html) && /"@type"\s*:\s*"?Event/i.test(html);
  const ical = /type="text\/calendar"|href="[^"]*\.ics(\?|")|webcal:|jevents|icalrepeat/i.test(html);
  const rss = /type="application\/(rss|atom)\+xml"/i.test(html);
  const cms = jsonld ? 'jsonld' : ical ? 'jevents-ical' : rss ? 'rss' : 'custom';
  return { jsonld, ical, rss, cms };
}
async function probe(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'bg,en' }, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return { ok: false, status: res.status };
    const html = await res.text();
    return { ok: true, ...fingerprint(html) };
  } catch (e) {
    return { ok: false, err: e.name === 'AbortError' ? 'timeout' : (e.message || 'fetch error') };
  } finally { clearTimeout(t); }
}

// A durable recrawl source is a listing/calendar page — it lists several
// events. A URL that yielded a single event is almost always a per-event
// detail permalink (dies once the event passes), not a source. Require >=2.
const MIN_EVENTS = 2;
const proposed = [];
const entries = [...groups.entries()].filter(([, g]) => g.ev >= MIN_EVENTS).sort((a, b) => b[1].ev - a[1].ev);
const droppedSingletons = groups.size - entries.length;
for (const [url, g] of entries) {
  const fp = await probe(url);
  await new Promise((r) => setTimeout(r, 400)); // politeness
  const structured = fp.ok && (fp.jsonld || fp.ical || fp.rss);
  // Confirmed to yield events + reachable + structured feed => high; reachable
  // OR high yield => medium; unreachable now (but produced events) => medium/low.
  let confidence = 'low';
  if (fp.ok && (structured || g.ev >= 5)) confidence = 'high';
  else if (fp.ok || g.ev >= 3) confidence = 'medium';
  const town = mode(g.towns);
  proposed.push({
    name: mode(g.names) || town,
    url,
    town,
    region: mode(g.oblasts) || null,
    country: 'BG',
    cms: fp.ok ? fp.cms : 'unknown',
    structured_data: { json_ld: !!fp.jsonld, ical: !!fp.ical, rss: !!fp.rss },
    confidence,
    events_seen: g.ev,
    reachable: !!fp.ok,
    notes: `discovered via Grok crawl 2026-07-12; ${g.ev} events seen; ${fp.ok ? `fp=${fp.cms}` : `probe ${fp.status || fp.err}`}`,
    probed_at: '2026-07-12',
  });
  process.stdout.write(`  ${String(g.ev).padStart(3)}ev  [${confidence}] ${fp.ok ? fp.cms.padEnd(12) : ('DOWN:' + (fp.status || fp.err)).padEnd(12)} ${url}\n`);
}

fs.writeFileSync(OUT, JSON.stringify({ country: 'BG', built_at: '2026-07-12', proposed }, null, 2) + '\n');
const byConf = proposed.reduce((a, r) => { a[r.confidence] = (a[r.confidence] || 0) + 1; return a; }, {});
console.log(`\nWrote ${proposed.length} BG listing sources (dropped ${droppedSingletons} single-event permalinks) -> ${path.relative(process.cwd(), OUT)}  (${JSON.stringify(byConf)})`);
