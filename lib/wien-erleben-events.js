// wien.gv.at "Wien erleben" (cms='wien-erleben') — pure parsing, no I/O.
// Listing pages are teaser cards; the schema.org/Event JSON-LD lives on each
// event's detail page in a non-standard dialect: recurring occurrences are a
// `subEvent[]` array (no top-level startDate), the address is `addresses[]`.
// Facts only: description is always null, unknown fields null, no date → skip.
import { splitLocalDateTime } from './event-time.js';

const DETAIL_RE = /href="(https:\/\/www\.wien\.gv\.at\/veranstaltungen\/[a-z0-9-]+)"/gi;

// Unique detail-page candidates in document order. Category/nav links (the
// listing itself, /kinder, …) are harmless: they carry no Event node.
export function extractWienDetailLinks(html, selfUrl = '') {
  const self = String(selfUrl).replace(/\/+$/, '');
  const seen = new Set();
  for (const m of String(html).matchAll(DETAIL_RE)) {
    if (m[1] !== self) seen.add(m[1]);
  }
  return [...seen];
}

function isEventType(t) {
  return (Array.isArray(t) ? t : [t]).some((ty) => /event$/i.test(String(ty || '')));
}

function collectNodes(data, out) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data)) { for (const d of data) collectNodes(d, out); return; }
  if (Array.isArray(data['@graph'])) for (const d of data['@graph']) collectNodes(d, out);
  if (data['@type']) out.push(data);
}

function trimOrNull(s) {
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

// One Event node → one event per occurrence. startDate/endDate carry a Vienna
// offset ("2026-11-12T16:00:00+01:00"), so the leading wall-clock part is
// already Europe/Vienna; we keep it verbatim and never convert via Date.
export function parseWienErlebenEventNode(n, pageUrl, src = {}) {
  const addr = Array.isArray(n.addresses) ? n.addresses[0] : null;
  const props = Array.isArray(n.additionalProperty) ? n.additionalProperty : [];
  const kidTag = props.some((p) => p && p.value === true && /kind/i.test(String(p.name || '')));
  const base = {
    title: trimOrNull(n.name),
    venue: addr ? trimOrNull(addr.name) : null,
    address: addr ? trimOrNull(addr.street) : null,
    town: src.town || 'Wien', // addressLocality is English ("Vienna") — never use it
    categories: kidTag ? ['family'] : [],
    is_free: typeof n.isAccessibleForFree === 'boolean' ? n.isAccessibleForFree : null,
    age_min: null, age_max: null, indoor: null,
    description: null,
    source_url: pageUrl,
  };
  const occurrences = Array.isArray(n.subEvent) && n.subEvent.length ? n.subEvent : [n];
  const out = [];
  for (const occ of occurrences) {
    const { date: date_start, time: time_start } = splitLocalDateTime(occ && occ.startDate);
    if (!base.title || !date_start) continue; // never fabricate: no date → skip
    const { date: date_end, time: time_end } = splitLocalDateTime(occ.endDate);
    out.push({ ...base, date_start, time_start, date_end: date_end || null, time_end: time_end || null });
  }
  return out;
}

// Whole detail page HTML → events.
export function parseWienErlebenDetailHtml(html, pageUrl, src = {}) {
  const events = [];
  for (const b of String(html).matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const nodes = [];
    collectNodes(data, nodes);
    for (const n of nodes) {
      if (isEventType(n['@type'])) events.push(...parseWienErlebenEventNode(n, pageUrl, src));
    }
  }
  return events;
}
