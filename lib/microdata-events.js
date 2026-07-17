// schema.org/Event as MICRODATA (itemscope/itemprop) → our event shape.
//
// Why this exists: `parseJsonLdEvents` only ever matched
// `<script type="application/ld+json">`, so a site that publishes the same
// schema.org/Event facts as Microdata fell through the whole structured
// waterfall and landed on the PAID LLM route. WDC 2024 puts Microdata at 46% of
// structured-data-emitting sites (docs/research/crawl-sota-2026.md), and the
// live case that forced this: muenchen.de — Munich's OFFICIAL city calendar —
// serves 100 `itemtype="https://schema.org/Event"` blocks and ZERO ld+json.
//
// Facts only, same contract as parseJsonLdEvents: `description` is always null
// (hard rule 1 — never copy source prose), and an event with no title or no
// resolvable date is skipped rather than guessed at (hard rule 5).

import { stripTags } from './entities.js';
import { splitLocalDateTime } from './event-time.js';

// Matches Event and every subtype (ChildrensEvent, MusicEvent, TheaterEvent…),
// mirroring isEventType()'s `/event$/i` on the JSON-LD side — anchoring on a
// bare "/Event" would miss the subtypes, which are the common case.
const EVENT_ITEMTYPE = /\bitemtype=["'][^"']*schema\.org\/\w*event["']/i;
const ITEMSCOPE_TAG = /<[a-zA-Z][\w-]*[^>]*\bitemscope\b[^>]*>/g;

// Microdata's value rules are per-element, not "just take the text": a <meta>
// carries @content, a <time> carries @datetime, a link-ish element carries its
// URL attribute. Reading textContent everywhere would silently turn
// `<time itemprop="startDate" datetime="2026-07-17T09:00">Fr. 17. Juli</time>`
// into the German prose "Fr. 17. Juli", which parses to no date at all.
const URL_ATTR = { a: 'href', area: 'href', link: 'href', img: 'src', audio: 'src', video: 'src', embed: 'src', iframe: 'src', source: 'src', track: 'src', object: 'data' };

function attr(tagHtml, name) {
  const m = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i').exec(tagHtml);
  return m ? m[1] : null;
}

// Find an element's full extent by counting tag depth from its opening tag.
// The lazy alternative — slicing from one itemtype marker to the next — is how
// a neighbour's text bleeds into this event's fields, which is exactly the
// corruption we refused to "repair" on krenglbach.at (tasks/lessons.md
// 2026-07-14). Void/self-closed elements have no inner content by definition.
const VOID_TAGS = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

function elementAt(html, start) {
  const open = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start));
  if (!open) return null;
  const tag = open[1];
  const tagEnd = html.indexOf('>', start);
  if (tagEnd === -1) return null;
  const openTag = html.slice(start, tagEnd + 1);
  if (VOID_TAGS.test(tag) || /\/>$/.test(openTag)) return { tag, openTag, inner: '', end: tagEnd + 1 };
  const re = new RegExp(`<${tag}\\b[^>]*>|<\\/${tag}\\s*>`, 'gi');
  re.lastIndex = tagEnd + 1;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') {
      if (--depth === 0) return { tag, openTag, inner: html.slice(tagEnd + 1, m.index), end: re.lastIndex };
    } else if (!/\/>$/.test(m[0])) depth++;
  }
  return { tag, openTag, inner: html.slice(tagEnd + 1), end: html.length };
}

// An itemprop belongs to the nearest enclosing itemscope. Without this, a nested
// Place's `<span itemprop="name">` could answer a query for the EVENT's name —
// the same class of bug as reading a venue's address as the event's.
function ownScope(inner) {
  let out = '';
  let i = 0;
  const re = new RegExp(ITEMSCOPE_TAG.source, 'g');
  let m;
  while ((m = re.exec(inner))) {
    if (m.index < i) continue;
    out += inner.slice(i, m.index);
    const el = elementAt(inner, m.index);
    i = el ? el.end : m.index + m[0].length;
    re.lastIndex = i;
  }
  return out + inner.slice(i);
}

// itemprop is a space-separated TOKEN LIST ("name headline"), so a substring
// match would let `addressLocality` answer a query for `address`. Match the
// attribute, then verify the token.
function propElement(scope, name) {
  const re = /<[a-zA-Z][\w-]*[^>]*\bitemprop=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(scope))) {
    if (!m[1].split(/\s+/).includes(name)) continue;
    return elementAt(scope, m.index);
  }
  return null;
}

function propValue(scope, name) {
  const el = propElement(scope, name);
  if (!el) return null;
  const tag = el.tag.toLowerCase();
  if (tag === 'meta') return attr(el.openTag, 'content');
  if (tag === 'time') return attr(el.openTag, 'datetime') || stripTags(el.inner) || null;
  if (URL_ATTR[tag]) return attr(el.openTag, URL_ATTR[tag]);
  return attr(el.openTag, 'content') || stripTags(el.inner) || null;
}

// location may be a bare string, or a nested Place itemscope carrying its own
// name/address. Both shapes appear in the wild; mirror jsonLdAddress()'s split.
function microdataLocation(inner) {
  const el = propElement(inner, 'location');
  if (!el) return { venue: null, address: null, town: null };
  const nested = EVENT_ITEMTYPE.test(el.openTag) ? '' : el.inner;
  const name = /\bitemscope\b/.test(el.openTag) ? propValue(ownScope(nested), 'name') : null;
  const venue = name || stripTags(el.inner) || null;
  const addrEl = propElement(el.inner, 'address');
  if (!addrEl) return { venue, address: null, town: null };
  if (/\bitemscope\b/.test(addrEl.openTag)) {
    const own = ownScope(addrEl.inner);
    return { venue, address: propValue(own, 'streetAddress'), town: propValue(own, 'addressLocality') };
  }
  return { venue, address: stripTags(addrEl.inner) || null, town: null };
}

function isFree(scope) {
  const el = propElement(scope, 'offers');
  if (!el) return null;
  const prices = [...el.inner.matchAll(/\bitemprop=["']price["'][^>]*>/gi)]
    .map((m) => Number(attr(m[0], 'content')))
    .filter((n) => !Number.isNaN(n));
  const metaPrice = propValue(el.inner, 'price');
  if (!prices.length && metaPrice != null && metaPrice !== '') prices.push(Number(metaPrice));
  const clean = prices.filter((p) => !Number.isNaN(p));
  return clean.length ? clean.every((p) => p === 0) : null;
}

const TYPE_CATEGORY = {
  musicevent: 'music', festival: 'festival', sportsevent: 'sport',
  theaterevent: 'culture', screeningevent: 'culture', exhibitionevent: 'culture',
  foodevent: 'food', childrensevent: 'family', educationevent: 'workshop', saleevent: 'market',
};
function categoryFromItemtype(openTag) {
  const m = /schema\.org\/(\w+)/i.exec(openTag);
  const cat = m ? TYPE_CATEGORY[m[1].toLowerCase()] : null;
  return cat ? [cat] : [];
}

// A time every event on the page shares, at a canonical date-only marker, is a
// SERIALIZATION ARTIFACT, not a fact. Measured on muenchen.de 2026-07-17: all
// 100 events publish startDate="...T12:00:00Z" (noon UTC — the standard
// TZ-safe encoding of a date-only field) while their visible markup shows 11
// distinct real clock times (09:00 x69, 17:00 x54, 18:00 x33 ...). Taking that
// literally would stamp 12:00 on all 100 — the same fabrication as the
// `T${time || '09:00'}` default that reached 12,052 live events
// (tasks/lessons.md 2026-07-14), just wearing a schema.org badge.
//
// Deliberately narrow, because dropping a REAL time is also a bug (an
// anti-fabrication rule that discards a fact is the twin failure): only
// midnight and noon are treated as markers, and only when EVERY event agrees
// and there are enough of them to be evidence. A theatre page whose 6 shows all
// start 19:30 keeps its 19:30.
const MARKER_TIMES = new Set(['00:00', '12:00']);
const MIN_UNIFORM = 3;

function timesArePlaceholders(starts) {
  const times = starts.map((s) => s.time);
  if (times.length < MIN_UNIFORM || times.some((t) => !t)) return false;
  if (new Set(times).size !== 1) return false;
  return MARKER_TIMES.has(times[0]);
}

export function parseMicrodataEvents(html, src) {
  const raw = [];
  const re = new RegExp(ITEMSCOPE_TAG.source, 'g');
  let m;
  while ((m = re.exec(html || ''))) {
    if (!EVENT_ITEMTYPE.test(m[0])) continue;
    const el = elementAt(html, m.index);
    if (!el) continue;
    re.lastIndex = el.end; // an Event's own nested scopes are not separate events
    const own = ownScope(el.inner);
    const title = propValue(own, 'name');
    const start = splitLocalDateTime(propValue(own, 'startDate'));
    if (!title || !start.date) continue; // never fabricate: no date → skip
    raw.push({ el, own, title, start, end: splitLocalDateTime(propValue(own, 'endDate')) });
  }

  const drop = timesArePlaceholders(raw.map((r) => r.start));
  return raw.map(({ el, own, title, start, end }) => {
    const { venue, address, town } = microdataLocation(el.inner);
    let source_url = propValue(own, 'url');
    if (source_url && src?.url) {
      try { source_url = new URL(source_url, src.url).toString(); } catch { /* keep as published */ }
    }
    return {
      title,
      date_start: start.date,
      time_start: drop ? null : start.time,
      date_end: end.date || null,
      time_end: drop ? null : end.time || null,
      venue, address, town: town || src?.town || null,
      categories: categoryFromItemtype(el.openTag),
      // Full inner, not `own`: an Offer is itself an itemscope, so ownScope()
      // has already stripped it out — same reason microdataLocation reads inner.
      is_free: isFree(el.inner),
      age_min: null, age_max: null, indoor: null,
      description: null,
      source_url: source_url || null,
    };
  });
}
