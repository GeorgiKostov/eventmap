// Deterministic parser for the Joomla "jevents" calendar extension
// (jevents.net) — a widely-used Joomla component, proven here against
// visitsofia.bg (Столична община / Sofia municipality's official
// tourism portal, ~176 events). jevents is host-agnostic: any Joomla site
// running it ships the same default/"iconic" view template classes, so
// this adapter is written against those classes, not against Sofia's copy.
//
// Two-hop, like lib/kalkalpen-events.js: enumerate the site's own
// `month.calendar` listing pages (current + next 2 months — the site's
// own "upcoming" window shifts per month requested, so 3 months gives
// near-complete coverage; verified live: 176/26/25 unique ids per month,
// 191 unique in the union), collect every `icalrepeat.detail` link they
// surface, then politeFetch each event's own detail page for the actual
// structured facts. Facts only — the `jevents_text_container` free-text
// block on the detail page is the organizer's own prose and is NEVER
// copied into `description` (hard rule 1); no photos.
//
// Never fabricate: a listing page with no `icalrepeat.detail` links, or a
// detail page with no title or no parseable `infodate`, is skipped
// entirely (returns [] / null), never guessed. A detail page's `infodate`
// carries only a single date (+ optional time) — jevents' own template
// never states an end date/time here, so `date_end`/`time_end` stay null
// rather than being inferred from the free-text body (e.g. "22 юни – 14
// август, 11:00-13:00 часа" inside the prose block is never parsed for a
// time — only the structured sidebar field is trusted).
//
// GENERIC markers (jevents' own default "iconic" view template — expected
// to hold on any Joomla+jevents install using stock templates):
//   - URL shape: <root>/month.calendar/YYYY/MM/DD/-  (list view)
//                <root>/icalrepeat.detail/YYYY/MM/DD/<id>/-/<slug>  (detail)
//   - list view: `.jev_list_row` > `.jev_list_container` >
//     `.jev_list_title a[href*=icalrepeat.detail]`
//   - detail view: one `<h1>` title; a right-column `.infoinside` panel
//     with `.infodate` (day-name + day + month-name + year [+ HH:MM]),
//     `.infoplace` (jevents' "place" field), `.infolocation` (jevents'
//     "location" field) — the latter two are optional, present only when
//     the organizer filled them in (never fabricate a value for either)
//   - an HTML comment "JEvents vX.Y.Z Stable ... jevents.net" is a
//     reliable CMS fingerprint marker, useful beyond this one adapter
//
// SOFIA-SPECIFIC (swap per install, not structural):
//   - Bulgarian month names (BG_MONTHS) — another jevents install in a
//     different language needs its own locale map, same shape
//   - `src.town` fallback (registered per source row, as with every adapter)
//   - the family-keyword regex is tuned to Bulgarian kids/family words
//
// CONTRACT: the registered source `url` must be the site's jevents
// component root (e.g. "https://example.com/component/jevents/", the
// bare non-SEF-aliased path — verified live to serve identical content to
// any localized/aliased equivalent) so month/detail URLs resolve by plain
// relative URL construction, with no per-site path guessing.

import { politeFetch, robotsAllowed } from './crawl-net.js';
import { decodeEntities, stripTags } from './entities.js';
import { sofiaNow } from './db.js';

const BG_MONTHS = {
  януари: '01', февруари: '02', март: '03', април: '04', май: '05', юни: '06',
  юли: '07', август: '08', септември: '09', октомври: '10', ноември: '11', декември: '12',
};

function absUrl(href, base) {
  if (!href) return null;
  try { return new URL(href, base).toString(); } catch { return null; }
}

// Current + next `monthsAhead-1` `month.calendar` URLs, anchored on day 01
// (verified live against visitsofia.bg: the day-of-month segment does not
// change the returned set, only year/month do). `now` is injectable so
// month enumeration is deterministic in tests.
export function jeventsMonthUrls(rootUrl, monthsAhead = 3, now = sofiaNow()) {
  const base = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
  const [y, m] = now.slice(0, 7).split('-').map(Number);
  const urls = [];
  for (let i = 0; i < monthsAhead; i++) {
    const total = y * 12 + (m - 1) + i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    urls.push(absUrl(`month.calendar/${yy}/${String(mm).padStart(2, '0')}/01/-`, base));
  }
  return urls;
}

// Every `icalrepeat.detail` href on a listing page -> absolute detail-page
// URL, deduped. Loose by design — matches the link wherever it appears
// (title anchor, or a "latest events" sidebar widget), not only inside
// `.jev_list_title`; a stray widget link is still a real, fetchable detail
// page and the caller's Set collapses true duplicates.
export function jeventsDetailUrls(html, base) {
  const hrefs = [...html.matchAll(/href="([^"]*icalrepeat\.detail\/\d{4}\/\d{2}\/\d{2}\/\d+[^"]*)"/gi)]
    .map((m) => absUrl(decodeEntities(m[1]), base));
  return [...new Set(hrefs.filter(Boolean))];
}

// "сряда 15 юли 2026" or "неделя 12 юли 2026 19:30" -> { date, time }. The
// leading day-of-week word is present in the source text but never parsed
// (locale-variable, not needed to build the date).
function parseInfoDate(text) {
  const m = (text || '').match(/(\d{1,2})\s+([A-Za-zА-Яа-яЁё]+)\s+(\d{4})(?:\D+(\d{2}):(\d{2}))?/);
  if (!m) return { date: null, time: null };
  const month = BG_MONTHS[m[2].toLowerCase()];
  if (!month) return { date: null, time: null };
  return { date: `${m[3]}-${month}-${m[1].padStart(2, '0')}`, time: m[4] ? `${m[4]}:${m[5]}` : null };
}

// One `.infoinside` sidebar field ("infodate"/"infoplace"/"infolocation") ->
// its `<p>` text, or null if the field is absent (jevents only renders a
// field when the organizer actually filled it in — never fabricate one).
function sidebarField(html, className) {
  const m = html.match(new RegExp(`<div class="${className}">[\\s\\S]*?<p>([\\s\\S]*?)</p>`, 'i'));
  return m ? stripTags(m[1]) || null : null;
}

// 'family' only where the title clearly reads as kids/family programming;
// null (empty array) beats a guess for anything else, same convention as
// lib/siteswift-events.js / lib/kalkalpen-events.js.
const FAMILY_RE = /дете|деца|детск|семейств|ученици/i;
function categorize(title) {
  return FAMILY_RE.test(title || '') ? ['family'] : [];
}

// One detail page -> one event, or null (no title / no parseable date ->
// never fabricate). `url` becomes the event's exact `source_url`.
export function parseJeventsDetail(html, url) {
  const titleMatch = html.match(/<h1>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : null;
  if (!title) return null;

  const { date: date_start, time: time_start } = parseInfoDate(sidebarField(html, 'infodate'));
  if (!date_start) return null; // never fabricate: no parseable date -> skip

  return {
    title, date_start, time_start, date_end: null, time_end: null,
    venue: sidebarField(html, 'infoplace'), address: sidebarField(html, 'infolocation'), town: null,
    categories: categorize(title), is_free: null, age_min: null, age_max: null, indoor: null,
    description: null, source_url: url,
  };
}

// Safety cap on detail-page fetches per crawl — generous headroom over
// Sofia's proven ~176/191-event calendar, bounding worst-case runaway on a
// hypothetical much larger jevents install without threatening real coverage.
const JEVENTS_DETAIL_CAP = 300;

// Full two-hop fetch for a cms='jevents' source: month listing pages
// (current + next 2 months) -> unique detail links -> each detail page's
// structured facts. Same politeness/robots discipline as every other
// adapter (politeFetch, robotsAllowed) for every hop, no shortcuts.
export async function fetchJeventsEvents(src, { monthsAhead = 3 } = {}) {
  const monthUrls = jeventsMonthUrls(src.url, monthsAhead);
  const detailUrls = new Set();
  for (const monthUrl of monthUrls) {
    try {
      if (!(await robotsAllowed(monthUrl))) continue;
      const res = await politeFetch(monthUrl);
      if (!res.ok) continue;
      const html = await res.text();
      for (const u of jeventsDetailUrls(html, monthUrl)) detailUrls.add(u);
    } catch { /* one bad month page must not break the others */ }
  }

  const events = [];
  for (const url of [...detailUrls].slice(0, JEVENTS_DETAIL_CAP)) {
    try {
      if (!(await robotsAllowed(url))) continue;
      const res = await politeFetch(url);
      if (!res.ok) continue;
      const ev = parseJeventsDetail(await res.text(), url);
      if (ev) events.push({ ...ev, town: ev.town || src.town || null });
    } catch { /* one broken detail page must not break the rest */ }
  }
  return events;
}
