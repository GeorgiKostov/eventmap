// Deterministic parser for the server-rendered Contao event lists (pure, no network).
// "contao" in the frozen-source probe is a loose signature; only three real,
// repeatable list shapes exist in the corpus, tried in order (first with output wins):
//
//   A  NÖ "eventapi" cards — `div.event-list--card.event-list-item`, one `<li>` per
//      occurrence inside `ul.listing.dates`, dd.mm.yyyy / d.m.yy dates, e.g.
//      wiener-neustadt.at/.../eventreader/<id>---<slug>, museum-wn.at.
//   B  Contao mod_eventlist teaser grid — `div.event.layout_teaser` with
//      `<time itemprop="startDate" datetime=…>` (montforthausfeldkirch.com).
//   C  Contao mod_eventlist "spielplan" — `div.event-week` rows with
//      `<time datetime=…>` (dschungelwien.at).
//
// Facts only: description stays null, images are never read. An entry without a
// reliable date or title is skipped, never guessed (CLAUDE.md rules 1 and 5).
// Times are the page's own Europe/Vienna wall-clock strings.

import { decodeEntities, stripTags } from './entities.js';
import { absUrl, pageBase, parseDateSpan, parseTimes } from './de-dates.js';

const clean = (s) => decodeEntities(stripTags(s || '')).replace(/\s+/g, ' ').trim();

function make(src, f) {
  return {
    title: f.title, date_start: f.date_start, time_start: f.time_start ?? null,
    date_end: f.date_end ?? null, time_end: f.time_end ?? null,
    venue: f.venue ?? null, address: null, town: src?.town || null,
    categories: [], is_free: null, age_min: f.age_min ?? null, age_max: null, indoor: null,
    description: null, source_url: f.source_url ?? null,
  };
}

// ISO attr "2026-11-14T19:00:00+01:00" / "2026-11-17" -> { date, time|null }
function isoAttr(v) {
  const m = (v || '').match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m) return null;
  return { date: m[1], time: m[2] && m[2] !== '00:00' ? m[2] : null };
}

// ---- A: NÖ eventapi cards ----
function parseEventApi(html, src, base) {
  const out = [];
  const chunks = html.split(/<div\s+class="event-list--card event-list-item[^"]*"\s*>/).slice(1);
  for (const chunk of chunks) {
    const t = chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const title = t && clean(t[1]);
    if (!title) continue;
    const href = (chunk.match(/<a[^>]+href="([^"]+)"[^>]*>\s*<h2/) || [])[1];
    const source_url = absUrl(decodeEntities(href || ''), base);
    const ul = chunk.match(/<ul[^>]*class="listing dates"[^>]*>([\s\S]*?)<\/ul>/);
    if (!ul) continue;
    for (const li of ul[1].split(/<li\b/).slice(1)) {
      const text = clean(li.replace(/<!--[\s\S]*?-->/g, '').replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, ''));
      const span = parseDateSpan(text);
      if (!span) continue;
      const { time_start, time_end } = parseTimes(text);
      out.push(make(src, {
        title, date_start: span.start, date_end: span.end,
        time_start, time_end: span.end ? null : time_end, source_url,
      }));
    }
  }
  return out;
}

// ---- B: mod_eventlist teaser grid ----
function parseTeaserGrid(html, src, base) {
  const out = [];
  const chunks = html.split(/<div class="event [^"]*layout_teaser[^"]*"([^>]*)>/);
  // split with a capture group: [pre, attrs1, body1, attrs2, body2, ...]
  for (let i = 1; i < chunks.length; i += 2) {
    const attrs = chunks[i]; const body = chunks[i + 1] || '';
    const tm = body.match(/<time\b[^>]*itemprop="startDate"[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/)
      || body.match(/<time\b[^>]*datetime="([^"]+)"[^>]*itemprop="startDate"[^>]*>([\s\S]*?)<\/time>/);
    if (!tm) continue; // placeholder cards ("event-not-found") have no <time>
    const start = isoAttr(tm[1]);
    const title = clean((body.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1]);
    if (!start || !title) continue;
    const span = parseDateSpan(clean(tm[2]));
    let date_end = null;
    if (span && span.start === start.date && span.end) date_end = span.end;
    const loc = (attrs.match(/data-location="([^"]*)"/) || [])[1];
    const href = (body.match(/<a[^>]+href="([^"]+)"/) || [])[1];
    out.push(make(src, {
      title, date_start: start.date, time_start: start.time, date_end,
      venue: loc ? clean(loc) || null : null,
      source_url: absUrl(decodeEntities(href || ''), base),
    }));
  }
  return out;
}

// ---- C: mod_eventlist spielplan rows ----
function parseEventWeek(html, src, base) {
  const out = [];
  const chunks = html.split(/<div class="event-week\b[^"]*">/).slice(1);
  for (const chunk of chunks) {
    const tm = chunk.match(/<time[^>]*datetime="([^"]+)"/);
    const start = tm && isoAttr(tm[1]);
    const a = chunk.match(/<h3[^>]*class="event-week__title"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const title = a && clean(a[2]);
    if (!start || !title) continue;
    const age = (chunk.match(/class="event-week__min-age">\s*ab\s+(\d{1,2})\b/) || [])[1];
    out.push(make(src, {
      title, date_start: start.date, time_start: start.time,
      age_min: age ? +age : null,
      source_url: absUrl(decodeEntities(a[1]), base),
    }));
  }
  return out;
}

// Pages often repeat an item (featured block + full list): keep the first.
function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => {
    const k = [e.title, e.date_start, e.time_start, e.source_url].join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function parseContaoEvents(html, src) {
  if (!html || typeof html !== 'string') return [];
  const base = pageBase(html, src);
  for (const fn of [parseEventApi, parseTeaserGrid, parseEventWeek]) {
    let events = [];
    try { events = fn(html, src, base); } catch { events = []; }
    if (events.length) return dedupe(events);
  }
  return [];
}
