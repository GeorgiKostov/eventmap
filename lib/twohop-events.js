// Two-hop JSON-LD adapter: a listing whose event DETAIL links are in static HTML
// (even when the listing itself is JS-rendered), where each detail page carries
// a full schema.org/Event in a JSON-LD `@graph`. Enumerate the detail links from
// the listing, politeFetch each, reuse parseJsonLdEvents. Same shape as
// lib/kalkalpen-events.js and lib/jevents-events.js.
//
// Why it exists: visitberlin.de and other tourism boards render their calendar
// client-side, so the generic waterfall sees no events on the listing — but the
// detail pages are clean JSON-LD ($0). Proven on visitberlin 2026-07-17: the
// Event sits inside `@graph` (top-level @type is null), which is exactly what
// collectJsonLdNodes already recurses.
//
// Per-source config (TWOHOP_SOURCES), keyed by the registered `url`, because the
// detail-link shape and pagination differ per site and the sources table has no
// config column. A source registered at a listing URL not in this map yields
// nothing (falls through to the LLM) — deliberately explicit, never a guess.
//
// Facts only: parseJsonLdEvents sets description=null; a detail page with no
// Event JSON-LD or no date is skipped, never fabricated. Bounded like
// familienportal — nightly + a near-term horizon means far-future detail pages
// are re-seen as they approach, so we don't fetch hundreds of them every night.

import { politeFetch } from './crawl-net.js';
import { parseJsonLdEvents } from './jsonld-events.js';

// Each entry: how to page the listing, and which links are event details.
export const TWOHOP_SOURCES = {
  // German listing (not /en/) so titles/venues come back in German for the
  // Berlin audience. ?page=0..N; detail links are /de/event/<slug> in static HTML.
  'https://www.visitberlin.de/de/kategorie/familie': {
    town: 'Berlin',
    pageParam: 'page',
    firstPage: 0,
    detailRe: /href=["'](\/de\/event\/[^"'?#]+)["']/g,
  },
};

export function twoHopConfig(url) {
  return TWOHOP_SOURCES[String(url).replace(/\/+$/, '')] || TWOHOP_SOURCES[url] || null;
}

function detailLinks(html, cfg, base) {
  const out = new Set();
  const re = new RegExp(cfg.detailRe.source, cfg.detailRe.flags);
  let m;
  while ((m = re.exec(html))) {
    try { out.add(new URL(m[1], base).toString()); } catch { /* skip */ }
  }
  return out;
}

export async function fetchTwoHopEvents(src, {
  maxPages = Number(process.env.TWOHOP_MAX_PAGES || 5),
  maxDetails = Number(process.env.TWOHOP_MAX_DETAILS || 120),
  horizonDays = 56,
} = {}) {
  const cfg = twoHopConfig(src.url);
  if (!cfg) return [];
  // Vienna-pinned window (hard rule 3). The trap: a JSON-LD Event's top-level
  // startDate is the SERIES PREMIERE for a recurring show, and visitberlin lists
  // shows still running whose premiere was years ago AND whose endDate is far in
  // the future ("Zaubertatzes Wunderworte": start 2022, end 2027). An overlap
  // check keeps those, but storing "starts 2022-06-09" for a show playing next
  // week is a wrong, useless date (hard rule 5) — and we can't recover the next
  // occurrence from the top-level fields. So bound date_start to a near window:
  // [today - PAST_DAYS, horizon]. A genuinely-ongoing exhibition that opened a
  // few weeks ago still reads as "on now"; a premiere older than that is dropped
  // rather than mis-dated.
  const vienna = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date(ms));
  const PAST_DAYS = 31;
  const floor = vienna(Date.now() - PAST_DAYS * 86400000);
  const horizon = vienna(Date.now() + horizonDays * 86400000);
  const town = src.town || cfg.town || null;

  // Hop 1: walk listing pages, collect distinct detail URLs (bounded).
  const details = new Set();
  for (let i = 0; i < maxPages && details.size < maxDetails; i++) {
    const page = cfg.firstPage + i;
    const listUrl = `${src.url}${src.url.includes('?') ? '&' : '?'}${cfg.pageParam}=${page}`;
    let html;
    try {
      const res = await politeFetch(listUrl);
      if (!res.ok) break;
      html = await res.text();
    } catch { break; }
    const links = detailLinks(html, cfg, src.url);
    const before = details.size;
    for (const l of links) { if (details.size < maxDetails) details.add(l); }
    if (details.size === before) break; // a page that adds nothing new = end of pagination
  }

  // Hop 2: fetch each detail, parse its JSON-LD Event.
  const events = [];
  const seen = new Set();
  for (const url of details) {
    let html;
    try {
      const res = await politeFetch(url);
      if (!res.ok) continue;
      html = await res.text();
    } catch { continue; }
    for (const ev of parseJsonLdEvents(html, { town })) {
      if (!ev.date_start) continue;
      if (ev.date_start > horizon || ev.date_start < floor) continue; // outside the near window (or a stale premiere)
      // Prefer the detail URL we fetched as the linkback (canonical over any
      // relative url the JSON-LD might carry).
      const e = { ...ev, town: ev.town || town, source_url: ev.source_url || url };
      const key = e.source_url || `${e.title}|${e.date_start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(e);
    }
  }
  return events;
}
