// Deterministic parser for TYPO3 event-list pages (pure, no network).
// Every TYPO3 site skins its list differently; only the shapes seen repeatedly (or
// unambiguously event-shaped) are supported, tried in order — first with output wins:
//
//   T1  tx_news "article" blocks used as an event list. tx_news is a NEWS extension,
//       so an item only counts as an event on a strong signal:
//         · schema.org Event / `itemprop="startDate"` (explicit event date), or
//         · a `datePublished` <time> that is really the event date: date-only
//           `datetime` plus a displayed clock time ("19:00 Uhr") or a displayed
//           weekday that matches that date ("Di, 17. November").
//       A plain publish date (possibly with a seconds timestamp) is NEVER an event.
//   T2  Burgenland/Gemeinde template: `div.event-wrap` + `event-start-day`/`event-teaser-title`.
//   T3  `div.ecx-item` (city of Leonding).
//   T4  `article.listitem--eventteaser` (Nußdorf-Debant).
//   T5  Vorarlberg `div.card` grid with `span.date` + `/veranstaltung/YYYY-MM-DD-…` links
//       (dornbirn.at family).
//
// Facts only: description null, no images. No reliable date/title -> entry skipped.
// Times are the page's own Europe/Vienna wall-clock strings.

import { decodeEntities, stripTags } from './entities.js';
import {
  absUrl, pageBase, parseDateSpan, parseTimes, weekdayFromWord, weekdayIndex,
} from './de-dates.js';

const clean = (s) => decodeEntities(stripTags((s || '').replace(/<br\s*\/?>/gi, ' '))).replace(/\s+/g, ' ').trim();

function make(src, f) {
  return {
    title: f.title, date_start: f.date_start, time_start: f.time_start ?? null,
    date_end: f.date_end ?? null, time_end: f.time_end ?? null,
    venue: f.venue ?? null, address: null, town: src?.town || null,
    categories: [], is_free: null, age_min: null, age_max: null, indoor: null,
    description: null, source_url: f.source_url ?? null,
  };
}

function isoAttr(v) {
  const m = (v || '').match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return { date: m[1], time: m[2] && m[2] !== '00:00' ? m[2] : null, hasSeconds: !!m[3] && m[3] !== '00' };
}

// ---- T1: tx_news articles ----
function parseNewsArticles(html, src, base) {
  const out = [];
  const chunks = html.split(/<div class="article\b[^"]*"/).slice(1);
  for (const raw of chunks) {
    const chunk = raw.slice(0, 8000);
    const isEvent = /itemtype="https?:\/\/schema\.org\/Event"/i.test(raw.slice(0, 200));
    const timeEl = chunk.match(/<time\b([^>]*)>([\s\S]*?)<\/time>/);
    if (!timeEl) continue;
    const dt = (timeEl[1].match(/datetime="([^"]+)"/) || [])[1];
    const start = isoAttr(dt);
    if (!start) continue;
    const shown = clean(timeEl[2].replace(/<meta[^>]*>/gi, ''));
    const isStart = /itemprop="startDate"/.test(timeEl[1]);
    const isPub = /itemprop="datePublished"/.test(timeEl[1]) || /itemprop="datePublished"/.test(timeEl[2]);

    let ok = false;
    let time_start = start.time; let time_end = null; let date_end = null;
    if (isStart || isEvent) {
      ok = !isPub || isStart;
      const t = parseTimes(shown);
      if (!time_start) time_start = t.time_start;
      time_end = t.time_end;
      const span = parseDateSpan(shown);
      if (span && span.end) time_end = null;
      if (span && span.end && span.start === start.date) date_end = span.end;
      const end = chunk.match(/<time\b[^>]*itemprop="endDate"[^>]*datetime="([^"]+)"/);
      const e = end && isoAttr(end[1]);
      if (e && e.date > start.date) date_end = e.date;
      if (e && e.date === start.date && e.time && !time_end) time_end = e.time;
    } else if (isPub && !start.hasSeconds && !start.time) {
      // publish-date element: accept only if the page shows event-ish detail
      const clock = /\d{1,2}[:.]\d{2}\s*Uhr/.test(shown);
      const wd = shown.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)\b\.?,?\s/i);
      const weekdayMatches = wd && weekdayFromWord(wd[1]) === weekdayIndex(start.date);
      const sd = parseDateSpan(shown);
      // a displayed full date must agree with the attribute
      const agrees = !sd || sd.start === start.date;
      if ((clock || weekdayMatches) && agrees) {
        ok = true;
        const t = parseTimes(shown);
        time_start = t.time_start; time_end = t.time_end;
      }
    }
    if (!ok) continue;

    const head = chunk.match(/itemprop="headline"[^>]*>([\s\S]*?)<\/span>/)
      || chunk.match(/<h[1-4][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    const title = head && clean(head[1]);
    if (!title) continue;
    const a = chunk.match(/<a\b[^>]*href="([^"]+)"/);
    let source_url = absUrl(decodeEntities((a && a[1]) || ''), base);
    if (source_url && /\.(pdf|docx?|xlsx?)(\?|$)/i.test(source_url)) source_url = null;
    const pl = chunk.match(/class="[^"]*news-(?:inner-)?place[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    out.push(make(src, {
      title, date_start: start.date, time_start, time_end, date_end,
      venue: pl ? clean(pl[1]) || null : null, source_url,
    }));
  }
  return out;
}

// ---- T2: event-wrap / event-start-day ----
function parseEventWrap(html, src, base) {
  const out = [];
  const parts = html.split(/<div class="event-wrap\b[^"]*"[^>]*>/);
  for (let i = 1; i < parts.length; i++) {
    const body = parts[i].slice(0, 3000);
    const days = [...body.matchAll(/class="event-start-day"[^>]*>([\s\S]*?)<\/(?:div|span)>/g)].map((m) => clean(m[1]));
    const t = body.match(/class="event-teaser-title"[^>]*>([\s\S]*?)<\/(?:div|span)>/);
    const title = t && clean(t[1]);
    if (!days.length || !title) continue;
    const span = parseDateSpan(days.join(' '));
    if (!span) continue;
    // linkback: the anchor sits either before this title (wrapping the block, or the
    // "stretched-link" that closes the previous segment) or after it (= the NEXT block's).
    const titleAt = body.search(/class="event-teaser-title"/);
    const inBlock = body.match(/<a\b[^>]*href="([^"]+)"/);
    let href = inBlock && inBlock.index < titleAt ? inBlock[1] : null;
    if (!href) {
      const prevBody = parts[i - 1].slice(-1500);
      const prevTitleAt = prevBody.search(/class="event-teaser-title"/);
      const prev = [...prevBody.matchAll(/<a\b[^>]*href="([^"]+)"/g)].pop();
      if (prev && prev.index > prevTitleAt) href = prev[1];
    }
    // single clock time anywhere in the teaser area -> time; otherwise leave null
    const teaser = clean(body.slice(body.search(/event-teaser/), body.search(/event-teaser/) + 700));
    const times = [...new Set([...teaser.matchAll(/(\d{1,2})[:.](\d{2})\s*Uhr/g)].map((m) => `${m[1].padStart(2, '0')}:${m[2]}`))];
    out.push(make(src, {
      title, date_start: span.start, date_end: span.end,
      time_start: !span.end && times.length === 1 ? times[0] : null,
      source_url: absUrl(decodeEntities(href || ''), base),
    }));
  }
  return out;
}

// ---- T3: ecx-item ----
function parseEcx(html, src, base) {
  const out = [];
  for (const body of html.split(/<div class="ecx-item">/).slice(1)) {
    const d = body.match(/<span class="day">([\s\S]*?)<\/span>/);
    const h = body.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    const span = d && parseDateSpan(clean(d[1]));
    const title = h && clean(h[1]);
    if (!span || !title) continue;
    const href = (body.match(/<a\b[^>]*href="([^"]+)"/) || [])[1];
    out.push(make(src, { title, date_start: span.start, date_end: span.end, source_url: absUrl(decodeEntities(href || ''), base) }));
  }
  return out;
}

// ---- T4: listitem--eventteaser ----
function parseListItem(html, src, base) {
  const out = [];
  for (const body of html.split(/<article class="listitem listitem--eventteaser[^"]*">/).slice(1)) {
    const tm = body.match(/<time\b[^>]*>([\s\S]*?)<\/time>/);
    const h = body.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    const span = tm && parseDateSpan(clean(tm[1]));
    const title = h && clean(h[1]);
    if (!span || !title) continue;
    // The <time> is the LAST day of a multi-day entry ("Larvenausstellung" Fr 20. -
    // So 22.11. shows 22.11.), so trust it only when the teaser line opens with the very
    // same single date: "Samstag, 14. November 2026, 10.00-15.00 Uhr (Saal)".
    const teaser = clean((body.match(/listitem__teaser[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
    const lead = teaser.match(/^(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s*(\d{1,2}\.\s*[\p{L}]+\.?\s*\d{4})(?=,|\s*\(|\s*$)/u);
    const leadSpan = lead && parseDateSpan(lead[1]);
    if (!leadSpan || leadSpan.start !== span.start || span.end) continue;
    const tt = /Uhr/.test(teaser) ? parseTimes(teaser) : { time_start: null, time_end: null };
    const href = (body.match(/<a\b[^>]*href="([^"]+)"/) || [])[1];
    out.push(make(src, {
      title, date_start: span.start, date_end: span.end, time_start: tt.time_start, time_end: tt.time_end,
      source_url: absUrl(decodeEntities(href || ''), base),
    }));
  }
  return out;
}

// ---- T5: Vorarlberg card grid ----
function parseCards(html, src, base) {
  const out = [];
  for (const body of html.split(/<div class="card ?">/).slice(1)) {
    const d = body.match(/<span class="date">([\s\S]*?)<\/span>\s*(?:<span class="category"|<\/p>)/);
    const h = body.match(/<h1 class="hyphenate"[^>]*>([\s\S]*?)<\/h1>/);
    const a = body.match(/<a\b[^>]*href="(\/veranstaltung\/[^"]+)"/);
    if (!d || !h) continue;
    const text = clean(d[1]);
    const span = parseDateSpan(text);
    const title = clean(h[1]);
    if (!span || !title) continue;
    const t = parseTimes(text);
    out.push(make(src, {
      title, date_start: span.start, date_end: span.end,
      time_start: t.time_start, time_end: span.end ? null : t.time_end,
      source_url: a ? absUrl(decodeEntities(a[1]), base) : null,
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

export function parseTypo3Events(html, src) {
  if (!html || typeof html !== 'string') return [];
  const base = pageBase(html, src);
  for (const fn of [parseNewsArticles, parseEventWrap, parseEcx, parseListItem, parseCards]) {
    let events = [];
    try { events = fn(html, src, base); } catch { events = []; }
    if (events.length) return dedupe(events);
  }
  return [];
}
