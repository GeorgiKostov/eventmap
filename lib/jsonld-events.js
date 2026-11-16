// schema.org/Event as JSON-LD → our event shape. Facts only: description is
// always null (hard rule 1 — never copy source prose, write our own).
//
// Extracted from scripts/crawl.mjs 2026-07-17 so the two-hop adapter
// (lib/twohop-events.js) can reuse the exact same parser on each detail page —
// one definition, mirroring lib/microdata-events.js. collectJsonLdNodes
// recurses `@graph`, which is why a detail page whose Event sits inside a graph
// (visitberlin, Hamburg Tourismus) still resolves.

import { splitLocalDateTime } from './event-time.js';
import { isCancelledStatus } from './cancellation.js';

const JSONLD_TYPE_CATEGORY = {
  musicevent: 'music', festival: 'festival', sportsevent: 'sport',
  theaterevent: 'culture', screeningevent: 'culture', exhibitionevent: 'culture',
  foodevent: 'food', childrensevent: 'family', educationevent: 'workshop', saleevent: 'market',
};
function categoryFromJsonLdType(t) {
  const types = Array.isArray(t) ? t : [t];
  for (const ty of types) {
    const cat = JSONLD_TYPE_CATEGORY[String(ty || '').toLowerCase()];
    if (cat) return [cat];
  }
  return [];
}
function isEventType(t) {
  const types = Array.isArray(t) ? t : [t];
  return types.some((ty) => /event$/i.test(String(ty || '')));
}

function collectJsonLdNodes(data, out) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data)) { for (const d of data) collectJsonLdNodes(d, out); return; }
  if (Array.isArray(data['@graph'])) { for (const d of data['@graph']) collectJsonLdNodes(d, out); }
  if (data['@type']) out.push(data);
  for (const key of ['event', 'events', 'itemListElement']) {
    if (Array.isArray(data[key])) for (const d of data[key]) collectJsonLdNodes(d, out);
  }
}

function jsonLdAddress(loc) {
  if (!loc) return { venue: null, address: null, town: null };
  if (typeof loc === 'string') return { venue: loc, address: null, town: null };
  const venue = loc.name || null;
  const addr = loc.address;
  if (typeof addr === 'string') return { venue, address: addr, town: null };
  if (addr && typeof addr === 'object') {
    return { venue, address: addr.streetAddress || null, town: addr.addressLocality || null };
  }
  return { venue, address: null, town: null };
}

function isFreeFromOffers(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  const prices = list.map((o) => (o && o.price != null ? Number(o.price) : null)).filter((p) => p != null && !Number.isNaN(p));
  if (!prices.length) return null;
  return prices.every((p) => p === 0);
}

// A title that states its own slot ("Highlightführung 11:00") is what the visitor
// reads. Some WordPress calendar plugins (Ars Electronica Center, 2026-11-16) emit
// startDate one hour late; when the title names exactly one HH:MM and it disagrees,
// the title wins and the end moves by the same amount.
function titleTimeFix(title, time_start, time_end) {
  const m = [...String(title).matchAll(/(?:^|[^\d:])([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*Uhr)?(?![\d:])/g)];
  if (m.length !== 1 || !time_start) return { time_start, time_end };
  const said = `${m[0][1].padStart(2, '0')}:${m[0][2]}`;
  if (said === time_start) return { time_start, time_end };
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const delta = mins(said) - mins(time_start);
  let end = time_end;
  if (end) {
    const e = mins(end) + delta;
    end = e >= 0 && e < 1440 ? `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}` : null;
  }
  return { time_start: said, time_end: end };
}

export function parseJsonLdEvents(html, src) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const nodes = [];
  for (const b of blocks) {
    let data;
    try { data = JSON.parse(b[1].trim()); } catch { continue; }
    collectJsonLdNodes(data, nodes);
  }
  const events = [];
  for (const n of nodes) {
    if (!isEventType(n['@type'])) continue;
    const title = n.name || null;
    const { date: date_start, time: rawStart } = splitLocalDateTime(n.startDate);
    if (!title || !date_start) continue; // never fabricate: no date → skip
    const { date: date_end, time: rawEnd } = splitLocalDateTime(n.endDate);
    const { time_start, time_end } = titleTimeFix(title, rawStart, rawEnd);
    const { venue, address, town } = jsonLdAddress(n.location);
    events.push({
      title, date_start, time_start, date_end: date_end || null, time_end: time_end || null,
      venue, address, town: town || src?.town || null,
      categories: categoryFromJsonLdType(n['@type']),
      is_free: isFreeFromOffers(n.offers), age_min: null, age_max: null, indoor: null,
      description: null,
      source_url: absoluteSourceUrl(n.url, src?.url),
      // GEM2GO and most CMS calendars mark a cancellation here, not in the
      // title. Kept as a flag (not skipped) so upsertEvent can unpublish the
      // row we already hold for this occurrence.
      ...(isCancelledStatus(n.eventStatus) ? { cancelled: true } : {}),
    });
  }
  return events;
}

function absoluteSourceUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
