'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, X, List, MagnifyingGlass, NavigationArrow, CalendarPlus, ShareNetwork, Camera, ImageSquare, LinkSimple, PencilSimple, CaretRight, BookmarkSimple, Flag, Warning } from '@phosphor-icons/react';
import { CATS, CatIcon, EVENT_CATS, PLACE_CATS, P as ICON_PATHS } from '../lib/icons.js';
import { LANGS, LANGUAGE_NAMES } from '../lib/i18n.js';
import { hasTime, makeStartsAt, inTimeOfDay } from '../lib/event-time.js';
import { TOWNS, townCentroid } from '../lib/towns.js';
import { searchPlaces, normalizePlace } from '../lib/places.js';
import { groupEventSeries } from '../lib/map-groups.js';
import { isForKids } from '../lib/kid-cats.js';
import { track } from '../lib/analytics.js';
import { useLanguage } from './language-provider.js';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const HOME = { lat: 48.3, lng: 14.29 }; // Linz fallback
// "Interested" is personal-first: the save lives in localStorage (works at zero
// traffic, no account), the server only keeps the aggregate counter. That counter
// stays hidden until enough people agree — showing "1 interested" reads as an
// empty room and is worse than showing nothing at all.
const SAVED_KEY = 'okolo_saved';
const INTEREST_SHOW_MIN = 3;
// All-GL pin handoff band: below LOW the clustered overview owns the map, above
// HIGH the detail sprite pins do; across the band both cross-fade via a single
// zoom-interpolated opacity expression MapLibre evaluates per frame on the GPU —
// no JS visibility flags, no per-frame move work (the DOM-marker drift class is
// gone by construction). Pick the band ends just inside each layer's minzoom/maxzoom.
const HANDOFF_LOW = 12.0;
const HANDOFF_HIGH = 12.6;
// The viewport is the spatial filter now (briefs/viewport-rebuild-brief.md):
// >= this zoom the server returns per-event rows ("pins" mode); below it,
// pre-aggregated cells. Must match ZOOM_TIER in app/api/events/route.js.
const ZOOM_TIER = 11.5;
// Pure top-level camera (zoom) expressions — the only form MapLibre precompiles
// into a per-zoom ramp. Pins fade in, clusters fade out, across the same band.
const PIN_FADE_IN = ['interpolate', ['linear'], ['zoom'], HANDOFF_LOW, 0, HANDOFF_HIGH, 1];
const CLUSTER_FADE_OUT = (peak) => ['interpolate', ['linear'], ['zoom'], HANDOFF_LOW, peak, HANDOFF_HIGH, 0];

function mapLibreLocale(t) {
  return {
    'Map.Title': t.mapLabel,
    'NavigationControl.ZoomIn': t.zoomIn,
    'NavigationControl.ZoomOut': t.zoomOut,
    'AttributionControl.ToggleAttribution': t.toggleAttribution,
  };
}

/* ---------------- date helpers (pinned to Europe/Vienna) ---------------- */
function todayStr(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);
}
function weekendDates() {
  const base = new Date(todayStr() + 'T12:00');
  const dow = base.getDay();
  const toSat = dow === 0 ? -1 : 6 - dow;
  return [todayStr(toSat), todayStr(toSat + 1)];
}
function addDays(dateStr, n) {
  const d = new Date(new Date(dateStr + 'T12:00').getTime() + n * 86400000);
  return new Intl.DateTimeFormat('en-CA').format(d);
}
function locale(lang) {
  return lang === 'de' ? 'de-AT' : lang === 'bg' ? 'bg-BG' : 'en-GB';
}
function fmtDay(dateStr, lang, t) {
  if (dateStr === todayStr()) return t.today;
  if (dateStr === todayStr(1)) return t.tomorrow;
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(dateStr + 'T12:00')
  );
}
function fmtDayLong(dateStr, lang, t) {
  const s = new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(dateStr + 'T12:00')
  );
  if (dateStr === todayStr()) return `${t.today} · ${s}`;
  if (dateStr === todayStr(1)) return `${t.tomorrow} · ${s}`;
  return s;
}
function fmtRangeChip(from, to, lang) {
  const f = new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short' });
  const a = f.format(new Date(from + 'T12:00'));
  if (!to || to === from) return a;
  return `${a} – ${f.format(new Date(to + 'T12:00'))}`;
}
function fmtWhen(ev, lang, t) {
  const startDay = ev.starts_at.slice(0, 10);
  const endDay = (ev.ends_at || ev.starts_at).slice(0, 10);
  let s = fmtDayLong(startDay, lang, t);
  if (endDay !== startDay) s += ` – ${fmtDayLong(endDay, lang, t)}`;
  if (ev.all_day) return `${s} · ${t.allDay}`;
  // No time published (lib/event-time.js) — say so, don't invent one and don't
  // claim "ganztägig", which would tell a parent they can turn up whenever.
  if (!hasTime(ev.starts_at)) return `${s} · ${t.timeTbd}`;
  s += ` · ${ev.starts_at.slice(11, 16)}`;
  if (ev.ends_at && endDay === startDay) s += `–${ev.ends_at.slice(11, 16)}`;
  return s;
}
function fmtWhenShort(ev, lang, t) {
  const d = fmtDay(ev.starts_at.slice(0, 10), lang, t);
  if (ev.all_day) return `${d} · ${t.allDay}`;
  if (!hasTime(ev.starts_at)) return `${d} · ${t.timeTbd}`;
  return `${d} · ${ev.starts_at.slice(11, 16)}`;
}

/* ---------------- places: opening hours (pinned to Europe/Vienna) ---------------- */
const DOW_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function viennaDowKey() {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Vienna', weekday: 'short' }).format(new Date()).toLowerCase().slice(0, 3);
}
function viennaNowHM() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
}
// {always:true} opening_hours = always open. null = unknown (render no status). Otherwise {mon:[["09:00","18:00"]],...}.
function openStatus(oh) {
  if (!oh) return { always: false, unknown: true, open: false, ranges: [] };
  if (oh.always) return { always: true, unknown: false, open: true, ranges: [] };
  const ranges = oh[viennaDowKey()] || [];
  const now = viennaNowHM();
  return { always: false, unknown: false, open: ranges.some(([s, e]) => s <= now && now <= e), ranges };
}
function placeStatusLabel(ev, t) {
  const st = openStatus(ev.opening_hours);
  if (st.unknown) return '';
  if (st.always) return t.alwaysOpen;
  return st.open ? t.openNow : t.closedNow;
}
function buildOpeningHours(hours) {
  const out = {};
  for (const k of DOW_ORDER) {
    const r = hours?.[k];
    if (r && r[0] && r[1]) out[k] = [[r[0], r[1]]];
  }
  return out;
}

/* ---------------- misc helpers ---------------- */
function distKm(a, b) {
  const R = 6371, dLa = ((b.lat - a.lat) * Math.PI) / 180, dLo = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Abbreviate a server cell count the way MapLibre's own supercluster formats
// point_count_abbreviated, so a cell bubble's digits look the same as a
// client-clustered one (n < 1000 → literal, else "1.2k").
function abbreviateCount(n) {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
}
function primaryCat(ev) {
  return (ev.categories || []).find((c) => CATS[c]) || 'family';
}
// Community = genuinely submitted by a member of the public (poster scan or the
// add-a-place/event form). Editorial/curated entries (crawl, osm_mined, and the
// legacy 'manual' curator seeds) are NOT community — they come from public data.
function isCommunitySubmitted(ev) {
  return ev.src_kind === 'user_photo' || ev.src_kind === 'user_manual' || ev.src_kind === 'user_link';
}
// Placeholder venues ('Online', 'Sonstige', 'онлайн', …) are not a physical
// place — never draw them on the map, in a pin or a town group (they have
// nowhere to point to). Mirrors lib/geocode.js SENTINEL_VENUES, duplicated as
// a tiny local check because that module pulls in server-only deps (postgres
// via lib/db.js) that must not enter the client bundle.
const SENTINEL_VENUES = new Set([
  'online', 'sonstige', 'sonstiges', 'diverse', 'verschiedene orte', 'div orte',
  'wird noch bekannt gegeben', 'siehe beschreibung', 'онлайн',
]);
function isOnlineVenue(ev) {
  return SENTINEL_VENUES.has((ev.venue || '').trim().toLowerCase());
}

/* ---------------- GL pin sprites ----------------
 * MapLibre paint/layout can't read CSS vars, so pin sprites are rasterized from
 * the SAME tokens the DOM uses: CATS[cat].color + the P glyph paths + #fff
 * border/glyph (design-system.md marker grammar). One sprite per category (16);
 * shape = kind is baked in (event = teardrop, place = circle) since event/place
 * category sets are disjoint. The selection halo and approx dashed ring are ALSO
 * sprites (per-cat halos + 2 approx shapes) so they follow the pin's silhouette —
 * a GL circle layer around a teardrop pin reads as the wrong shape (George,
 * 2026-07-13). Badges/community dots/cross-fade stay plain layers. */
const PIN_S = 28;                     // pin body box (DOM .pin2 was 32; sprite adds pad)
const PIN_PAD = 3;                    // room for the 2px white border
const PIN_BOX = PIN_S + PIN_PAD * 2;  // 34px shown at icon-size 1
const HALO_S = 44;                    // selection halo silhouette — rings the 1.28× selected pin
const HALO_BOX = 46;
const TOWN_BUBBLE_S = 40;             // town-group dashed bubble diameter
const TOWN_BUBBLE_BOX = 44;
const SPRITE_RATIO = 3;               // supersample so pins stay crisp on hidpi

// Teardrop (event) = circle with a sharp-ish bottom-left corner, matching the CSS
// border-radius 50% 50% 50% 4px; place = full circle. r = s/2 so the top/right are
// a semicircle and only the bottom-left corner changes with `place`.
function pinSilhouette(s, place) {
  const r = s / 2;
  const bl = place ? r : 4;
  return `M${r} 0A${r} ${r} 0 0 1 ${s} ${r}A${r} ${r} 0 0 1 ${r} ${s}L${bl} ${s}`
    + `A${bl} ${bl} 0 0 1 0 ${s - bl}L0 ${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}
function pinSpriteSvg(cat) {
  const place = PLACE_CATS.includes(cat);
  const color = CATS[cat].color;                       // token: CATS[cat].color
  const glyph = 15, g = PIN_PAD + (PIN_S - glyph) / 2; // glyph centered on body
  const paths = (ICON_PATHS[cat] || ICON_PATHS.family).map((d) => `<path d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_BOX}" height="${PIN_BOX}" viewBox="0 0 ${PIN_BOX} ${PIN_BOX}">`
    + `<g transform="translate(${PIN_PAD} ${PIN_PAD})"><path d="${pinSilhouette(PIN_S, place)}" fill="${color}" stroke="#fff" stroke-width="2"/></g>`
    + `<g transform="translate(${g} ${g}) scale(${glyph / 24})" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
    + `</svg>`;
}
// Selection halo: the pin's own silhouette, enlarged, in the category color —
// shape-matched (teardrop halo on a teardrop pin), opacity applied by the layer.
function haloSpriteSvg(cat) {
  const place = PLACE_CATS.includes(cat);
  const pad = (HALO_BOX - HALO_S) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${HALO_BOX}" height="${HALO_BOX}" viewBox="0 0 ${HALO_BOX} ${HALO_BOX}">`
    + `<g transform="translate(${pad} ${pad})"><path d="${pinSilhouette(HALO_S, place)}" fill="${CATS[cat].color}"/></g></svg>`;
}
// Town-level positions never become individual pins (a pin claims "a venue is
// here", which a town centroid can't support) — they collapse into ONE dashed
// bubble per town instead (grouping happens in townGroupData below). Neutral
// fill (no category color — a town group has no single category), dashed
// outline reusing the same "approximate" stroke language the old per-pin halo
// used, circular only (no shape to match — a town group isn't a venue or kind).
function townBubbleSvg() {
  const pad = (TOWN_BUBBLE_BOX - TOWN_BUBBLE_S) / 2, r = TOWN_BUBBLE_S / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TOWN_BUBBLE_BOX}" height="${TOWN_BUBBLE_BOX}" viewBox="0 0 ${TOWN_BUBBLE_BOX} ${TOWN_BUBBLE_BOX}">`
    + `<circle cx="${pad + r}" cy="${pad + r}" r="${r - 1}" fill="rgba(246,246,243,0.95)" stroke="rgba(33,43,40,0.72)" stroke-width="2" stroke-dasharray="4 4"/></svg>`;
}
// Rasterize an SVG string to ImageData at SPRITE_RATIO for map.addImage.
function rasterizeSprite(svg, cssW, cssH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(cssW * SPRITE_RATIO);
      c.height = Math.round(cssH * SPRITE_RATIO);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
// Build + register every pin sprite. Async (Image.onload), so callers gate layer
// creation on the returned promise; addImage must run after the style has loaded.
async function registerPinSprites(map) {
  const add = async (name, svg, w, h) => {
    const data = await rasterizeSprite(svg, w, h);
    if (!map.hasImage(name)) map.addImage(name, data, { pixelRatio: SPRITE_RATIO });
  };
  await Promise.all([
    ...Object.keys(CATS).map((cat) => add(`pin-${cat}`, pinSpriteSvg(cat), PIN_BOX, PIN_BOX)),
    ...Object.keys(CATS).map((cat) => add(`halo-${cat}`, haloSpriteSvg(cat), HALO_BOX, HALO_BOX)),
    add('town-bubble', townBubbleSvg(), TOWN_BUBBLE_BOX, TOWN_BUBBLE_BOX),
  ]);
}
// Venue matching: identical venue name in the same town (case-insensitive) OR
// within ~30m. Used both to collapse event pins per venue and to list "more at
// this venue". Two guards against runaway merges:
// - the name branch requires the same town, or generic venue names ("Online",
//   "Ortsplatz") would fuse unrelated events across the whole region;
// - the ≤30m proximity branch only applies when BOTH events have better-than-town
//   geo_precision — town-fallback events all share the identical town centroid,
//   so proximity would merge every town-precision event in a town into one pin.
function normVenue(s) {
  return (s || '').trim().toLowerCase();
}
function sameVenue(a, b) {
  const va = normVenue(a.venue), vb = normVenue(b.venue);
  if (va && va === vb && normVenue(a.town) === normVenue(b.town)) return true;
  if (a.geo_precision === 'town' || b.geo_precision === 'town') return false;
  return distKm(a, b) <= 0.03; // 30m
}

// Group only the currently relevant rows. A small spatial index preserves the
// existing same-name/30m behavior without the old all-pairs scan over thousands
// of published events.
function groupEventsByVenue(items) {
  const byId = new Map();
  const groups = [];
  const byName = new Map();
  const byCell = new Map();
  const cellSize = 0.0005; // ~37m longitude near Linz; adjacent cells cover 30m
  const cell = (ev) => [Math.floor(ev.lat / cellSize), Math.floor(ev.lng / cellSize)];
  const cellKey = (a, b) => `${a}:${b}`;

  for (const ev of items) {
    if (ev.kind === 'place') continue;
    const candidates = new Set();
    const nameKey = normVenue(ev.venue) ? `${normVenue(ev.venue)}|${normVenue(ev.town)}` : '';
    if (nameKey && byName.has(nameKey)) candidates.add(byName.get(nameKey));
    if (ev.geo_precision !== 'town') {
      const [cy, cx] = cell(ev);
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let x = cx - 1; x <= cx + 1; x++) {
          for (const g of byCell.get(cellKey(y, x)) || []) candidates.add(g);
        }
      }
    }
    let group = [...candidates]
      .sort((a, b) => a.index - b.index)
      .find((g) => sameVenue(g.members[0], ev));
    if (!group) {
      group = { index: groups.length, members: [ev] };
      groups.push(group);
      if (nameKey) byName.set(nameKey, group);
      if (ev.geo_precision !== 'town') {
        const [cy, cx] = cell(ev);
        const key = cellKey(cy, cx);
        if (!byCell.has(key)) byCell.set(key, []);
        byCell.get(key).push(group);
      }
    } else {
      group.members.push(ev);
    }
    byId.set(ev.id, group);
  }
  return byId;
}
// Shared date math for all three calendar targets.
// timed  → start "20260712T193000", end +2h if no ends_at (Vienna wall-clock)
// all-day → start "20260712", end exclusive next day "20260713"
function calDates(ev) {
  const compact = (iso) => iso.replace(/[-:]/g, '');
  // An event with no published time can only be exported as an all-day entry —
  // iCal has no "date, time unknown". That is a calendar-format limit, not a
  // claim we store: the DB row still says nothing about the time.
  if (ev.all_day || !hasTime(ev.starts_at)) {
    const lastDay = (ev.ends_at || ev.starts_at).slice(0, 10);
    const endExcl = new Intl.DateTimeFormat('en-CA').format(new Date(new Date(lastDay + 'T12:00').getTime() + 86400000)).replace(/-/g, '');
    return { allDay: true, start: ev.starts_at.slice(0, 10).replace(/-/g, ''), end: endExcl, startIso: ev.starts_at.slice(0, 10), endIso: lastDay };
  }
  const end = ev.ends_at || `${ev.starts_at.slice(0, 11)}${String(Math.min(23, +ev.starts_at.slice(11, 13) + 2)).padStart(2, '0')}${ev.starts_at.slice(13, 16)}`;
  return { allDay: false, start: `${compact(ev.starts_at)}00`, end: `${compact(end)}00`, startIso: `${ev.starts_at}:00`, endIso: `${end}:00` };
}
function calLocation(ev) {
  return [ev.venue, ev.address, ev.town].filter(Boolean).join(', ');
}
function calDetails(ev) {
  const src = ev.source_url ? `\n\nQuelle: ${ev.source_url}` : '';
  return `${ev.description || ''}${src}`.trim();
}

// "Add to Google Calendar" — opens a prefilled event, no file download (the
// download path never worked reliably on mobile / for Google).
function googleCalUrl(ev) {
  const d = calDates(ev);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${d.start}/${d.end}`, location: calLocation(ev), details: calDetails(ev) });
  if (!d.allDay) p.set('ctz', 'Europe/Vienna');
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
// Outlook.com / Microsoft 365 web compose.
function outlookCalUrl(ev) {
  const d = calDates(ev);
  const p = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent', subject: ev.title,
    startdt: d.startIso, enddt: d.endIso, location: calLocation(ev), body: calDetails(ev),
    allday: String(d.allDay),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}
// .ics download (Apple Calendar, Thunderbird, anything else). RFC-5545 TEXT
// values must escape \\ ; , and newlines — unescaped commas in LOCATION were
// why imports mis-parsed.
function makeIcs(ev) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const d = calDates(ev);
  const dtLines = d.allDay
    ? [`DTSTART;VALUE=DATE:${d.start}`, `DTEND;VALUE=DATE:${d.end}`]
    : [`DTSTART;TZID=Europe/Vienna:${d.start}`, `DTEND;TZID=Europe/Vienna:${d.end}`];
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//okolo//events//DE', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:okolo-${ev.id}@okolo.events`, ...dtLines,
    `SUMMARY:${esc(ev.title)}`,
    `LOCATION:${esc(calLocation(ev))}`,
    ev.description || ev.source_url ? `DESCRIPTION:${esc(calDetails(ev))}` : null,
    ev.source_url ? `URL:${esc(ev.source_url)}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.title.slice(0, 40).replace(/[^\wäöüÄÖÜß -]/g, '')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
async function downscale(file, maxEdge = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  // Always re-encode (not just when resizing) so uploads stay small even for
  // already-≤1600px source images (e.g. large uncompressed PNG screenshots).
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.8));
}

/* ---------------- date range picker ---------------- */
function DateRangePicker({ lang, t, from, to, onChange, onDone }) {
  const today = todayStr();
  const [view, setView] = useState(() => {
    const base = from || today;
    return { y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 };
  });
  const monthName = new Intl.DateTimeFormat(locale(lang), { month: 'long', year: 'numeric' }).format(new Date(view.y, view.m, 15));
  const first = new Date(view.y, view.m, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const daysIn = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) {
    cells.push(`${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  function pick(day) {
    if (!from || (from && to)) onChange(day, null);
    else if (day < from) onChange(day, null);
    else onChange(from, day);
  }
  return (
    <div className="dp-pop" onClick={(e) => e.stopPropagation()}>
      <div className="dp-head">
        <button className="dp-nav" onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))} aria-label={t.previousMonth}>‹</button>
        <b>{monthName}</b>
        <button className="dp-nav" onClick={() => setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))} aria-label={t.nextMonth}>›</button>
      </div>
      <div className="dp-grid">
        {t.weekdays.map((w) => <div key={w} className="dp-wd">{w}</div>)}
        {cells.map((day, i) =>
          day === null ? (
            <div key={`p${i}`} />
          ) : (
            <button
              key={day}
              disabled={day < today}
              className={
                'dp-day' +
                (day === from || day === to ? ' edge' : '') +
                (from && to && day > from && day < to ? ' inrange' : '') +
                (day === today ? ' today' : '')
              }
              onClick={() => pick(day)}
            >
              {+day.slice(8, 10)}
            </button>
          )
        )}
      </div>
      <div className="dp-actions">
        <span className="dp-label">{from ? fmtRangeChip(from, to, lang) : `${t.from} – ${t.to}`}</span>
        <button className="dp-done" disabled={!from} onClick={onDone}>{t.done}</button>
      </div>
    </div>
  );
}

/* ---------------- pin-drop location picker ---------------- */
// "Drag the map under a fixed center pin" (Google-Maps drop-pin pattern) —
// shared by the add-a-place map mode and the event-confirm precision refine step.
function PinDropPicker({ center, t, onConfirm }) {
  const ref = useRef(null);
  const mapR = useRef(null);
  const [pos, setPos] = useState(center);
  useEffect(() => {
    const map = new maplibregl.Map({
      container: ref.current,
      style: MAP_STYLE,
      center: [center.lng, center.lat],
      zoom: 16,
      attributionControl: false,
      locale: mapLibreLocale(t),
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('moveend', () => {
      const c = map.getCenter();
      setPos({ lat: c.lat, lng: c.lng });
    });
    mapR.current = map;
    return () => { map.remove(); mapR.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pinpicker">
      <div className="pinpicker-map" ref={ref} />
      <span className="pinpicker-crosshair" aria-hidden>📍</span>
      <span className="pinpicker-hint">{t.dragMapHint}</span>
      <button type="button" className="abtn primary pinpicker-confirm" onClick={() => onConfirm(pos)}>{t.confirmPosition}</button>
    </div>
  );
}

/* ==================================================================== */
export default function Home() {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  // Pin lookups for the GL layers: id → grouped item (click/flyTo) and member id
  // → representative id (a venue/series group is one pin; selecting any member
  // lights its representative). Rebuilt with the pin source data.
  const pinIndexRef = useRef({ itemById: new Map(), memberToRep: new Map() });
  const pinSelRef = useRef(null); // feature id currently carrying feature-state selected
  const fileInput = useRef(null);
  const cameraInput = useRef(null);

  const { lang, t, chooseLanguage } = useLanguage();
  useEffect(() => {
    const root = mapRef.current;
    if (!root) return;
    for (const [selector, label] of [
      ['.maplibregl-canvas', t.mapLabel],
      ['.maplibregl-ctrl-zoom-in', t.zoomIn],
      ['.maplibregl-ctrl-zoom-out', t.zoomOut],
      ['.maplibregl-ctrl-attrib-button', t.toggleAttribution],
    ]) {
      const element = root.querySelector(selector);
      if (!element) continue;
      element.setAttribute('aria-label', label);
      if (element.matches('button')) element.setAttribute('title', label);
    }
    const placeAttribution = root.querySelector('.maplibregl-ctrl-attrib-inner > a');
    if (placeAttribution) placeAttribution.textContent = t.mapAttribution;
  }, [t]);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const upd = () => setIsDesktop(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  const [events, setEvents] = useState(null);
  const [me, setMe] = useState(HOME);
  const [located, setLocated] = useState(false); // true once we have a real (not fallback) position
  const [locating, setLocating] = useState(false); // true while a locate-me geolocation fetch is in flight
  const meMarker = useRef(null);
  const searchMarker = useRef(null);

  // "search anywhere" reference point — set when the user picks a location (town/
  // address) from the search dropdown. Distance labels recompute around it
  // instead of `me`; null restores the user's own position as reference.
  const [searchCenter, setSearchCenter] = useState(null); // {lat,lng,label} | null
  const refPoint = searchCenter || me;

  // top-right actions menu + search
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [orteMatches, setOrteMatches] = useState([]); // instant gazetteer/town matches
  const [geoMatches, setGeoMatches] = useState([]); // remote suggest results (villages, addresses)
  const [geoLoading, setGeoLoading] = useState(false);
  const geoDebounce = useRef(null);
  const geoReqId = useRef(0);
  // Global text search (title/venue/town) — independent of the viewport, so a
  // Bulgarian event can be found while looking at Linz. Server-backed (?q=)
  // since the client only holds the current viewport's rows.
  const [qResults, setQResults] = useState([]);
  const [qLoading, setQLoading] = useState(false);
  const qDebounce = useRef(null);
  const qReqId = useRef(0);
  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    setOrteMatches([]);
    setGeoMatches([]);
    setGeoLoading(false);
    setQResults([]);
    setQLoading(false);
    clearTimeout(geoDebounce.current);
    clearTimeout(qDebounce.current);
  }

  // distinct town centroids: the static list (lib/towns.js) + any town names
  // present in loaded events/places that aren't in it (resolved via the same
  // fuzzy townCentroid lookup, falling back to the average position of that
  // town's rows if even that misses).
  const townCenters = useMemo(() => {
    const m = new Map(Object.entries(TOWNS));
    if (events) {
      const averages = new Map();
      for (const ev of events) {
        if (!ev.town || m.has(ev.town)) continue;
        const acc = averages.get(ev.town) || { lat: 0, lng: 0, count: 0 };
        acc.lat += ev.lat; acc.lng += ev.lng; acc.count++;
        averages.set(ev.town, acc);
      }
      for (const ev of events) {
        if (!ev.town || m.has(ev.town)) continue;
        let c = townCentroid(ev.town);
        if (!c) {
          const acc = averages.get(ev.town);
          c = { lat: acc.lat / acc.count, lng: acc.lng / acc.count };
        }
        m.set(ev.town, c);
      }
    }
    return m;
  }, [events]);

  function openNewsletter() {
    const nearest = [...townCenters.entries()].reduce((best, [label, center]) => {
      const distance = distKm(refPoint, center);
      return !best || distance < best.distance ? { label, center, distance } : best;
    }, null);
    setNl({
      open: true,
      email: '',
      area: nearest?.label || 'Linz',
      areaLat: nearest?.center.lat ?? HOME.lat,
      areaLng: nearest?.center.lng ?? HOME.lng,
      categories: [],
      busy: false,
      done: false,
      err: '',
    });
  }

  function changeNewsletterArea(value) {
    const exact = [...townCenters.entries()].find(([name]) => name.toLowerCase() === value.trim().toLowerCase());
    setNl((s) => ({
      ...s,
      area: value,
      areaLat: exact?.[1].lat ?? null,
      areaLng: exact?.[1].lng ?? null,
      err: '',
    }));
  }

  // Long tail of the location search: everything the gazetteer doesn't carry
  // (villages, hamlets, addresses), via the Photon autocomplete endpoint.
  // Localities come first, then streets/POIs; anything already matched locally
  // is dropped so a place can't appear twice.
  async function runPlaceSuggest(q, localLabels) {
    const reqId = ++geoReqId.current;
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/geocode?suggest=1&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const rows = [];
      for (const r of Array.isArray(data.results) ? data.results : []) {
        const key = normalizePlace(r.label);
        // Photon happily returns the same street as several OSM ways.
        if (localLabels.has(key) || rows.some((x) => normalizePlace(x.label) === key)) continue;
        rows.push(r);
      }
      rows.sort((a, b) => Number(b.place) - Number(a.place));
      if (reqId === geoReqId.current) setGeoMatches(rows.slice(0, 4));
    } catch {
      if (reqId === geoReqId.current) setGeoMatches([]);
    } finally {
      if (reqId === geoReqId.current) setGeoLoading(false);
    }
  }

  // Instant, offline location matches as the user types: the city/town
  // gazetteer (lib/places.js) plus the towns of the loaded events, ranked
  // prefix-first. A remote geocoder can't do this — Photon biases to the map
  // centre, so "vie"/"wie" near Linz returns a street long before Vienna —
  // hence the static list carries the names people actually type.
  useEffect(() => {
    const q = searchQuery.trim();
    clearTimeout(geoDebounce.current);
    if (q.length < 2) { setOrteMatches([]); setGeoMatches([]); setGeoLoading(false); return; }
    const local = searchPlaces(q, { extra: townCenters });
    setOrteMatches(local);
    setGeoMatches([]);
    if (q.length >= 3) {
      const localLabels = new Set(local.flatMap((l) => l.keys));
      geoDebounce.current = setTimeout(() => runPlaceSuggest(q, localLabels), 300);
    } else {
      setGeoLoading(false);
    }
    return () => clearTimeout(geoDebounce.current);
  }, [searchQuery, townCenters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced (400ms, ≥2 chars) global event search — the client only holds the
  // current viewport's rows, so finding an event anywhere means asking the server.
  useEffect(() => {
    const q = searchQuery.trim();
    clearTimeout(qDebounce.current);
    if (q.length < 2) { setQResults([]); setQLoading(false); return; }
    setQLoading(true);
    qDebounce.current = setTimeout(async () => {
      const reqId = ++qReqId.current;
      try {
        const res = await fetch(`/api/events?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (reqId === qReqId.current) setQResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (reqId === qReqId.current) setQResults([]);
      } finally {
        if (reqId === qReqId.current) setQLoading(false);
      }
    }, 400);
    return () => clearTimeout(qDebounce.current);
  }, [searchQuery]);

  // Animated camera moves depend on MapLibre's render loop, which dies when the
  // basemap style CDN is unreachable — the fly never progresses, `moveend` never
  // fires, and the viewport fetch silently stays on the OLD area while the
  // "Around X" chip claims the new one (integration finding, 2026-07-14). This
  // watchdog snaps with jumpTo (synchronous transform + synchronous moveend) if
  // the animation hasn't settled shortly after it should have. Healthy CDN:
  // moveend fires, watchdog cleared, zero behavior change.
  function flyAssured(opts) {
    const map = mapObj.current;
    if (!map) return;
    let settled = false;
    const onEnd = () => { settled = true; };
    map.once('moveend', onEnd);
    map.flyTo(opts);
    setTimeout(() => {
      if (settled) return;
      map.off('moveend', onEnd);
      map.jumpTo({ center: opts.center, zoom: opts.zoom });
    }, (opts.duration ?? 800) + 600);
  }

  // selecting a location result: fly there, drop a temporary marker, and make
  // it the reference point for distances.
  function selectLocation(loc) {
    closeSearch();
    setSearchCenter({ lat: loc.lat, lng: loc.lng, label: loc.label });
    flyAssured({ center: [loc.lng, loc.lat], zoom: Math.max(mapObj.current?.getZoom() ?? 0, 12), duration: 800 });
  }
  function clearSearchCenter() {
    setSearchCenter(null);
    flyAssured({ center: [me.lng, me.lat], zoom: Math.max(mapObj.current?.getZoom() ?? 0, 12), duration: 700 });
  }
  // Picking a server search result: fly there immediately (zoom ≥ 13, so the
  // viewport lands in pins mode), then hydrate the full row and select it —
  // the event is very likely off the currently-loaded viewport, so it must
  // NOT be looked up in `events`.
  function selectSearchResult(ev) {
    closeSearch();
    flyAssured({ center: [ev.lng, ev.lat], zoom: Math.max(mapObj.current?.getZoom() ?? 0, 13), duration: 800 });
    fetch(`/api/events?id=${encodeURIComponent(ev.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.event) selectEvent(data.event, { fly: false }); })
      .catch(() => {});
  }

  // filters
  const [kindFilter, setKindFilter] = useState('all'); // all | event | place
  const [whenMode, setWhenMode] = useState('weekend'); // all | today | tomorrow | weekend | next7 | range
  const [range, setRange] = useState({ from: null, to: null });
  const [dpOpen, setDpOpen] = useState(false);
  const [dpDraft, setDpDraft] = useState({ from: null, to: null });
  // Search re-runs the whole grouping pipeline + rewrites both GeoJSON sources —
  // deferred so per-keystroke work can't jank the map at scale.
  const deferredSearch = useDeferredValue(searchQuery);
  const [cats, setCats] = useState([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [kidsOnly, setKidsOnly] = useState(false);
  const [communityOnly, setCommunityOnly] = useState(false); // only events added by users (src_kind user_*)
  const [inOut, setInOut] = useState('any'); // any | in | out
  const [tod, setTod] = useState([]); // morning | afternoon | evening

  // ui state
  const [showFilters, setShowFilters] = useState(false);
  const [sheet, setSheet] = useState('closed'); // mobile: closed | half | full
  const [sheetContent, setSheetContent] = useState('list'); // list | filters
  const [selected, setSelected] = useState(null);
  // Tapping a town-group bubble opens the list scoped to that town, never the
  // single-event detail (a town group isn't one event to drill into).
  const [selectedTown, setSelectedTown] = useState(null); // { town, country } | null
  const [detailFull, setDetailFull] = useState(false);
  const [calMenu, setCalMenu] = useState(false); // event id whose "add to calendar" menu is open
  const [nl, setNl] = useState({
    open: false, email: '', area: '', areaLat: null, areaLng: null,
    categories: [], busy: false, done: false, err: '',
  });
  const [advertiseOpen, setAdvertiseOpen] = useState(false);
  const [limitNotice, setLimitNotice] = useState(null);
  const [toast, setToast] = useState('');
  const toastT = useRef(null);

  // scan flow
  const [capture, setCapture] = useState(false);
  const [scanState, setScanState] = useState('pick');
  const [scanImg, setScanImg] = useState(null);
  const [scanErr, setScanErr] = useState('');
  const [draft, setDraft] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);
  const [urlInput, setUrlInput] = useState(''); // intake: paste-a-link field
  const [mapPick, setMapPick] = useState(false); // location picking happens on the MAIN map
  const [refine, setRefine] = useState(null); // pending low-precision publish awaiting pin refine
  const [dupNotice, setDupNotice] = useState(null); // {id,title,starts_at} — scan matched an already-published event
  const mapPickProgrammatic = useRef(false); // guard: our own flyTo must not trigger a reverse-geocode overwrite
  const mapPickSnapshot = useRef(null); // draft location before entering map-pick, for cancel
  const addFlowActiveRef = useRef(false); // map click handler is bound once → read this ref, not state
  addFlowActiveRef.current = capture || mapPick;
  const reverseDebounce = useRef(null);
  const reverseReqId = useRef(0); // latest-wins guard for reverse-geocode responses
  const urlBusy = useRef(false); // in-flight guard for the link-extraction pipeline

  // address autocomplete (task 4b): debounced GET /api/geocode?suggest=1&q=… while
  // typing in the address field of either form; a parallel agent owns the endpoint.
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [addrSuggestOpen, setAddrSuggestOpen] = useState(false);
  const addrDebounce = useRef(null);
  const addrReqId = useRef(0);

  useEffect(() => {
    if (!limitNotice) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setLimitNotice(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [limitNotice]);

  async function fetchAddressSuggestions(q) {
    const reqId = ++addrReqId.current;
    try {
      const res = await fetch(`/api/geocode?suggest=1&q=${encodeURIComponent(q)}`);
      if (!res.ok) { if (reqId === addrReqId.current) setAddrSuggestions([]); return; }
      const data = await res.json();
      if (reqId === addrReqId.current) setAddrSuggestions(Array.isArray(data.results) ? data.results : []);
    } catch {
      if (reqId === addrReqId.current) setAddrSuggestions([]);
    }
  }
  function onAddressChange(v) {
    // typing invalidates any previously picked/dropped coordinates — the address
    // text and lat/lng must stay in sync, publish() prefers lat/lng when present.
    setDraft((d) => ({ ...d, address: v, lat: null, lng: null }));
    setAddrSuggestOpen(true);
    clearTimeout(addrDebounce.current);
    const q = v.trim();
    if (q.length < 3) { setAddrSuggestions([]); return; }
    addrDebounce.current = setTimeout(() => fetchAddressSuggestions(q), 300);
  }
  function pickAddressSuggestion(s) {
    setDraft((d) => ({ ...d, address: s.label, lat: s.lat, lng: s.lng }));
    setAddrSuggestions([]);
    setAddrSuggestOpen(false);
    // Two-way bind: a picked address flies the main map to that point (visible on
    // desktop and in map-pick mode). Flag the move so its moveend doesn't reverse-
    // geocode over what we just set.
    if (mapObj.current && s.lat != null) {
      flyProgrammatic([s.lng, s.lat], Math.max(mapObj.current.getZoom(), 15));
    }
  }
  // Fly the main map from a geocode result WITHOUT letting the resulting moveend
  // reverse-geocode over the address we just set. The flag is force-cleared on a
  // timer so it can never get stuck (a no-op flyTo may emit no moveend).
  function flyProgrammatic(center, zoom) {
    mapPickProgrammatic.current = true;
    mapObj.current?.flyTo({ center, zoom, duration: 700 });
    clearTimeout(reverseDebounce.current);
    setTimeout(() => { mapPickProgrammatic.current = false; }, 900);
  }

  async function submitNewsletter(e) {
    e.preventDefault();
    const email = nl.email.trim();
    const area = nl.area.trim();
    if (!email || !area) return;
    setNl((s) => ({ ...s, busy: true, err: '' }));
    try {
      let location = nl.areaLat != null && nl.areaLng != null
        ? { label: area, lat: nl.areaLat, lng: nl.areaLng }
        : null;
      if (!location) {
        // Try the UI-language country first, then the other — the map covers
        // both AT and BG, so a Bulgarian-speaker in Linz (or vice versa) must
        // not be told their real town is invalid just because of the language.
        const tryGeo = async (country) => {
          const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(area)}&country=${country}`);
          const geoData = await geoRes.json();
          return geoRes.ok ? geoData.result : null;
        };
        const primary = lang === 'bg' ? 'BG' : 'AT';
        location = await tryGeo(primary) || await tryGeo(primary === 'AT' ? 'BG' : 'AT');
      }
      if (!location) throw new Error(t.nlAreaInvalid);
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Okolo-Lang': lang },
        body: JSON.stringify({
          email,
          lang,
          areaLabel: area,
          areaLat: location.lat,
          areaLng: location.lng,
          radiusKm: 20,
          categories: nl.categories,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.requestFailed);
      track('newsletter_signup');
      setNl((s) => ({ ...s, busy: false, done: true, pending: data.pending !== false }));
    } catch (err) {
      setNl((s) => ({ ...s, busy: false, err: String(err.message || err) }));
    }
  }

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 2800);
  }

  /* ---------------- interested / save + data-quality reports ---------------- */
  // saved = this device's list (localStorage, no account). interestCounts = optimistic
  // overrides on top of the server counts that ride along with each row.
  const [saved, setSaved] = useState([]);
  // Full rows for saved ids, resolved via /api/events?ids= — saved events are
  // usually OFF the current viewport now, so they can no longer be looked up in
  // `events` (which is just the loaded viewport rows). Keyed by string id.
  const [savedCache, setSavedCache] = useState({});
  const [interestCounts, setInterestCounts] = useState({});
  const [savedOpen, setSavedOpen] = useState(false);
  const [reportMenu, setReportMenu] = useState(false); // event id whose reason menu is open
  const [reported, setReported] = useState([]); // reported this session — don't offer twice

  // Resolve saved ids against the server, ONLY dropping ids the server confirms
  // are gone (absent from the ?ids= response). Never prune for being merely
  // outside the viewport — that's exactly the bug class that once silently
  // wiped the saved list (tasks/lessons.md).
  async function resolveSavedIds(ids) {
    if (!ids.length) return;
    try {
      const res = await fetch(`/api/events?ids=${ids.join(',')}`);
      if (!res.ok) return; // network hiccup — never prune on a failed lookup
      const data = await res.json();
      const found = new Map((data.events || []).map((e) => [String(e.id), e]));
      setSavedCache((c) => ({ ...c, ...Object.fromEntries(found) }));
      setSaved((current) => {
        const requested = new Set(ids);
        const next = current.filter((id) => !requested.has(id) || found.has(id));
        if (next.length !== current.length) {
          try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* private mode */ }
        }
        return next;
      });
    } catch { /* network error — keep the list as-is */ }
  }

  // Ids are Postgres bigints, which arrive as STRINGS ("373"), not numbers — so
  // saved ids are normalized to strings on every path. A Number-typed guard here
  // silently ate the whole saved list on reload.
  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
      if (Array.isArray(list)) {
        const ids = list.map(String).filter((id) => /^\d+$/.test(id));
        setSaved(ids);
        if (ids.length) resolveSavedIds(ids);
      }
    } catch { /* corrupt/blocked storage — start empty */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Also re-resolve whenever the modal opens, so a save made from a search
  // result / another session's data is fresh and any newly-expired event drops.
  useEffect(() => {
    if (savedOpen && saved.length) resolveSavedIds(saved);
  }, [savedOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function persistSaved(next) {
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }

  const interestCount = (ev) => interestCounts[ev.id] ?? ev.interest_count ?? 0;

  // Saved ids resolved against the cache, in save order (newest last).
  const savedItems = useMemo(
    () => saved.map((id) => savedCache[id]).filter(Boolean),
    [saved, savedCache]
  );

  const isSaved = (ev) => saved.includes(String(ev.id));

  function toggleSaved(ev) {
    const id = String(ev.id);
    const on = !isSaved(ev);
    persistSaved(on ? [...saved, id] : saved.filter((s) => s !== id));
    if (on) setSavedCache((c) => ({ ...c, [id]: ev }));
    setInterestCounts((c) => ({ ...c, [ev.id]: Math.max(0, interestCount(ev) + (on ? 1 : -1)) }));
    track('interest', { kind: ev.kind, id: ev.id, on });
    // The save already happened locally; the counter is best-effort. A failed
    // request must never cost the user their saved event.
    fetch('/api/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-okolo-lang': lang },
      body: JSON.stringify({ id: ev.id, kind: 'interest', on }),
    })
      .then((r) => r.json())
      .then((d) => { if (typeof d.count === 'number') setInterestCounts((c) => ({ ...c, [ev.id]: d.count })); })
      .catch(() => { /* keep the optimistic count */ });
  }

  function sendReport(ev, reason) {
    setReportMenu(false);
    setReported((r) => [...r, ev.id]);
    track('report', { kind: ev.kind, id: ev.id, reason });
    showToast(t.reportThanks);
    fetch('/api/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-okolo-lang': lang },
      body: JSON.stringify({ id: ev.id, kind: reason }),
    }).catch(() => { /* fire-and-forget */ });
  }

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (distKm(loc, HOME) < 80) { setMe(loc); setLocated(true); }
      },
      () => {},
      { timeout: 4000 }
    );
  }, []);

  function locateMe() {
    if (!navigator.geolocation) { showToast(t.locateUnavailable); return; }
    // respond instantly: fly to the last known position while the fresh fix loads
    const hadFix = located;
    if (hadFix) {
      setSearchCenter(null); // restore own location as the reference point
      flyAssured({ center: [me.lng, me.lat], zoom: Math.max(mapObj.current?.getZoom() ?? 0, 13), duration: 800 });
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(loc);
        setLocated(true);
        setSearchCenter(null);
        setLocating(false);
        flyAssured({ center: [loc.lng, loc.lat], zoom: Math.max(mapObj.current?.getZoom() ?? 0, 13), duration: 800 });
      },
      (err) => {
        setLocating(false);
        // already showing the last known position — a fresh-fix failure isn't worth a scary toast
        if (!hadFix) showToast(err.code === 1 ? t.locateDenied : t.locateUnavailable);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  /* ---------------- map ---------------- */
  // Sprites register asynchronously after the style loads; the pin layers can't
  // be added until they're on the map, so this gates their install.
  const [spritesReady, setSpritesReady] = useState(false);
  // 'load' has fired (once per map lifetime). Layer-install effects gate on THIS,
  // never on map.isStyleLoaded(): that flag flips false again whenever the style
  // is dirty (addImage, setData, tiles still streaming), and a once('load')
  // fallback registered after the real 'load' already fired never fires — which
  // silently skipped the pin install (bug: "zooming in shows nothing", 2026-07-13).
  const [mapLoaded, setMapLoaded] = useState(false);
  // Separate from mapLoaded on purpose: mapLoaded waits on the basemap style
  // (openfreemap CDN) and gates LAYER install; the data fetch only needs the
  // map's transform (center/zoom/bounds), which exists from construction. A
  // tile-CDN outage must degrade to "grey map, working list" — never to
  // "0 events" (integration finding, 2026-07-14).
  const [mapInit, setMapInit] = useState(false);
  const selectRef = useRef(() => {});
  const fetchViewportRef = useRef(() => {}); // latest fetchViewport closure for the once-bound map listeners
  const moveendTimer = useRef(null);

  useEffect(() => {
    if (mapObj.current || !mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE,
      center: [HOME.lng, HOME.lat],
      // The viewport is the spatial filter now — the initial view must already
      // sit in "pins" mode (>= ZOOM_TIER) so first paint shows real pins, not
      // just cluster bubbles.
      zoom: 12.5,
      locale: mapLibreLocale(t),
      // OSM-mined place *data* requires its own ODbL credit beyond the tile attribution.
      attributionControl: {
        compact: true,
        customAttribution: `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">${t.mapAttribution}</a>`,
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      setMapLoaded(true);
      // Rasterize + register the category pin sprites, then let the pin layers install.
      registerPinSprites(map).then(() => setSpritesReady(true)).catch((e) => console.error('[pins] sprite', e));
    });
    // Safety net: if a sprite ever isn't registered when a layer references it,
    // rasterize it on demand so a pin never renders as a blank box.
    map.on('styleimagemissing', (e) => {
      const put = (svg, w, h) => rasterizeSprite(svg, w, h).then((d) => { if (!map.hasImage(e.id)) map.addImage(e.id, d, { pixelRatio: SPRITE_RATIO }); });
      const pinCat = e.id.startsWith('pin-') ? e.id.slice(4) : null;
      const haloCat = e.id.startsWith('halo-') ? e.id.slice(5) : null;
      if (pinCat && CATS[pinCat]) put(pinSpriteSvg(pinCat), PIN_BOX, PIN_BOX);
      else if (haloCat && CATS[haloCat]) put(haloSpriteSvg(haloCat), HALO_BOX, HALO_BOX);
      else if (e.id === 'town-bubble') put(townBubbleSvg(), TOWN_BUBBLE_BOX, TOWN_BUBBLE_BOX);
    });
    // ONE click handler routes every map tap with explicit priority — cluster
    // bubble → pin → overview point → deselect. Layer-specific on('click', layer)
    // handlers are deliberately NOT used for actions: they fire in registration
    // order relative to this one, so split routing races (a bubble tap in the
    // crossfade band used to fall through to an arbitrary nearby pin).
    map.on('click', (e) => {
      // During the add-flow (capture form / map-pick) a pin tap must NOT select +
      // flyTo — the resulting moveend would silently overwrite the location the
      // user is placing (review finding, 2026-07-13).
      if (addFlowActiveRef.current) return;
      const top = (layer) => (map.getLayer(layer) ? map.queryRenderedFeatures(e.point, { layers: [layer] })[0] : null);
      const clusterBubble = () => top('result-cluster-bubbles') || top('result-cell-bubbles');
      const zoomToBubble = (bubble) => map.easeTo({ center: bubble.geometry.coordinates, zoom: Math.min(13, map.getZoom() + 2) });
      // Town-group bubbles render in the SAME zoom band as pins (never a solid
      // cluster, never an individual pin — design-system.md marker grammar), with
      // a tolerance box like pins. Opens the list scoped to that town.
      const townBubble = () => {
        if (!map.getLayer('town-group-bubbles')) return null;
        const pad = 8;
        const box = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
        let best = null; let bestD = Infinity;
        for (const h of map.queryRenderedFeatures(box, { layers: ['town-group-bubbles'] })) {
          const p = map.project(h.geometry.coordinates);
          const d = (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2;
          if (d < bestD) { bestD = d; best = h; }
        }
        return best;
      };
      const openTown = (best) => {
        setSelected(null);
        setDetailFull(false);
        setSelectedTown({ town: best.properties.town, country: best.properties.country });
        setSheetContent('list');
        setSheet('full');
      };
      // Priority depends on the zoom band. clusterMaxZoom is 12 and the crossfade
      // runs to HANDOFF_HIGH, so a fading-out cluster bubble is STILL hit-testable
      // (queryRenderedFeatures ignores opacity) at the same screen spot as a
      // fading-IN town bubble. Once we're in/above the handoff band the town
      // grammar owns the tap; below it, clusters do. Either way a bubble tap never
      // falls through to a pin/deselect.
      if (map.getZoom() >= HANDOFF_LOW) {
        const tb = townBubble();
        if (tb) { openTown(tb); return; }
        const cb = clusterBubble();
        if (cb) { zoomToBubble(cb); return; }
      } else {
        const cb = clusterBubble();
        if (cb) { zoomToBubble(cb); return; }
      }
      // 2. Pins (rendered from HANDOFF_LOW up), with a few-px tolerance box.
      let item = null;
      if (map.getLayer('pins')) {
        const pad = 6;
        const box = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
        // Nearest hit to the tap, not [0] — query order follows source order, so
        // with overlapping pins the first entry can be an occluded pin.
        const hits = map.queryRenderedFeatures(box, { layers: ['pins'] });
        let best = null; let bestD = Infinity;
        for (const h of hits) {
          const p = map.project(h.geometry.coordinates);
          const d = (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2;
          if (d < bestD) { bestD = d; best = h; }
        }
        if (best) item = pinIndexRef.current.itemById.get(best.properties.id);
      }
      if (item) { selectRef.current(item); return; }
      // 3. Below the band pins don't render yet — an overview dot tap zooms in.
      if (map.getZoom() < HANDOFF_LOW) {
        const pt = top('result-overview-points');
        if (pt) {
          map.easeTo({ center: pt.geometry.coordinates, zoom: Math.min(13, map.getZoom() + 2) });
          return;
        }
      }
      // 4. Empty map → deselect (and drop any town-group scoping).
      selectRef.current(null, { fly: false });
      setSelectedTown(null);
      setMenuOpen(false);
    });
    // Viewport-native fetch: refetch on every settle, debounced so a drag/zoom
    // gesture doesn't fire a request per frame. Skipped during the add-flow
    // (capture/map-pick), whose own moves aren't "browsing the map".
    map.on('moveend', () => {
      if (addFlowActiveRef.current) return;
      clearTimeout(moveendTimer.current);
      moveendTimer.current = setTimeout(() => fetchViewportRef.current(), 400);
    });
    const meEl = document.createElement('div');
    meEl.className = 'me-marker hidden';
    meMarker.current = new maplibregl.Marker({ element: meEl }).setLngLat([HOME.lng, HOME.lat]).addTo(map);
    map.on('error', (e) => console.error('[maplibre]', e?.error?.message || e));
    mapObj.current = map;
    setMapInit(true);
    return () => {
      clearTimeout(moveendTimer.current);
      map.remove();
      mapObj.current = null;
    };
  }, []);

  useEffect(() => {
    meMarker.current?.setLngLat([me.lng, me.lat]);
  }, [me]);

  useEffect(() => {
    meMarker.current?.getElement().classList.toggle('hidden', !located);
  }, [located]);

  // temporary marker at the search-anywhere reference point.
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (!searchCenter) {
      if (searchMarker.current) { searchMarker.current.remove(); searchMarker.current = null; }
      return;
    }
    // Create once; afterwards just move it.
    if (!searchMarker.current) {
      const el = document.createElement('div');
      el.className = 'search-marker';
      searchMarker.current = new maplibregl.Marker({ element: el }).setLngLat([searchCenter.lng, searchCenter.lat]).addTo(map);
    } else {
      searchMarker.current.setLngLat([searchCenter.lng, searchCenter.lat]);
    }
  }, [searchCenter]);

  // Map-pick mode: keep draft coords glued to the map centre, and on settle
  // reverse-geocode into address+town — unless the move was our own flyTo (loop
  // guard), which already knows the address it flew to.
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !mapPick) return;
    const onMove = () => {
      const c = map.getCenter();
      setDraft((d) => (d ? { ...d, lat: c.lat, lng: c.lng } : d));
      if (mapPickProgrammatic.current) { mapPickProgrammatic.current = false; return; }
      clearTimeout(reverseDebounce.current);
      reverseDebounce.current = setTimeout(async () => {
        // Latest-wins: a fast drag can fire several lookups; a slow earlier
        // one must not overwrite the address for where the pin now sits.
        const reqId = ++reverseReqId.current;
        try {
          const res = await fetch(`/api/geocode?reverse=1&lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}`);
          const data = await res.json();
          if (reqId !== reverseReqId.current) return;
          const a = data.address;
          if (a) setDraft((d) => (d ? { ...d, address: a.address ?? d.address, town: a.town || d.town } : d));
        } catch { /* keep whatever's there */ }
      }, 600);
    };
    map.on('moveend', onMove);
    return () => { map.off('moveend', onMove); clearTimeout(reverseDebounce.current); };
  }, [mapPick]);

  // Intake paste: while the intake screen is open, a pasted image goes to the
  // scan pipeline and pasted URL text goes to the link pipeline.
  useEffect(() => {
    if (!capture || scanState !== 'pick') return;
    const onPaste = (e) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) { e.preventDefault(); handleFile(file); return; }
        }
      }
      const text = e.clipboardData?.getData('text')?.trim();
      if (text && /^https?:\/\/\S+$/i.test(text)) { e.preventDefault(); setUrlInput(text); handleUrl(text); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [capture, scanState]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectEvent(ev, { fly = true } = {}) {
    setSelected(ev);
    setDetailFull(false);
    if (ev) {
      // The homepage payload intentionally omits heavy detail-only fields.
      // Hydrate just the row the user opens, without delaying the map response.
      if (!Object.prototype.hasOwnProperty.call(ev, 'description')) {
        fetch(`/api/events?id=${encodeURIComponent(ev.id)}`)
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            if (data?.event) setSelected((current) => current?.id === ev.id ? data.event : current);
          })
          .catch(() => {});
      }
      track('open_detail', { kind: ev.kind, cat: primaryCat(ev), town: ev.town });
      // Fly to the group's representative pin (selecting a list row that's a venue
      // /series member centers on the single pin that stands for it). The visual
      // selection (halo + scale) is driven off React `selected` via feature-state
      // in a dedicated effect — no marker DOM to toggle here.
      if (fly && mapObj.current) {
        const repId = pinIndexRef.current.memberToRep.get(ev.id) ?? ev.id;
        const rep = pinIndexRef.current.itemById.get(repId);
        mapObj.current.flyTo({
          center: [rep?.lng ?? ev.lng, rep?.lat ?? ev.lat],
          zoom: Math.max(mapObj.current.getZoom(), 12.5),
          padding: isDesktop ? { left: 0 } : { top: 200, bottom: 150 },
          duration: 700,
        });
      }
    }
  }
  selectRef.current = selectEvent;

  /* ---------------- filtering ---------------- */
  const [dFrom, dTo] = useMemo(() => {
    const today = todayStr();
    switch (whenMode) {
      case 'today': return [today, today];
      case 'tomorrow': return [todayStr(1), todayStr(1)];
      case 'weekend': return weekendDates();
      case 'next7': return [today, addDays(today, 7)];
      case 'range': return [range.from || today, range.to || range.from || today];
      default: return [today, addDays(today, 400)];
    }
  }, [whenMode, range]);

  /* ---------------- viewport-native fetch ---------------- */
  // The viewport is the spatial filter (briefs/viewport-rebuild-brief.md): fetch
  // whatever's on-screen from Postgres/PostGIS instead of shipping every row to
  // every visitor. `mode` tracks the LAST server response's shape — >= ZOOM_TIER
  // the server returns per-event rows ("pins"), below it pre-aggregated cells.
  const [mode, setMode] = useState('pins');
  const [cells, setCells] = useState([]); // cells mode only: [{lat,lng,n}]
  const [viewTotal, setViewTotal] = useState(0);
  const [viewTruncated, setViewTruncated] = useState(false); // drives the "zoom in to see all" hint (truncatedNote below)
  const viewportAbort = useRef(null);

  // Clamp to the server's bbox span cap (brief: >20° -> 400) around the current
  // center, so a user zoomed out to see the whole region never 400s the fetch.
  function clampBbox([w, s, e, n]) {
    const MAX = 19.5;
    if (e - w > MAX) { const c = (e + w) / 2; w = c - MAX / 2; e = c + MAX / 2; }
    if (n - s > MAX) { const c = (n + s) / 2; s = c - MAX / 2; n = c + MAX / 2; }
    return [Math.max(-180, w), Math.max(-90, s), Math.min(180, e), Math.min(90, n)];
  }

  // Mirrors app/api/events/route.js's parseFilters() 1:1 — kind/cats/inout/tod/
  // free/kids/community/from/to. `from`/`to` are date-only 'YYYY-MM-DD' (the
  // same dFrom/dTo the client's own filteredEvents memo uses).
  function buildFilterParams() {
    const p = new URLSearchParams();
    if (kindFilter !== 'all') p.set('kind', kindFilter);
    if (cats.length) p.set('cats', cats.join(','));
    if (inOut !== 'any') p.set('inout', inOut);
    if (tod.length) p.set('tod', tod.join(','));
    if (freeOnly) p.set('free', '1');
    if (kidsOnly) p.set('kids', '1');
    if (communityOnly) p.set('community', '1');
    p.set('from', dFrom);
    p.set('to', dTo);
    return p;
  }

  async function fetchViewport() {
    const map = mapObj.current;
    if (!map) return;
    const b = map.getBounds();
    const bbox = clampBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    const zoom = map.getZoom();
    const params = buildFilterParams();
    params.set('view', 'map');
    params.set('bbox', bbox.map((v) => v.toFixed(5)).join(','));
    params.set('zoom', String(zoom));

    viewportAbort.current?.abort();
    const ac = new AbortController();
    viewportAbort.current = ac;
    try {
      const res = await fetch(`/api/events?${params.toString()}`, { signal: ac.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (ac.signal.aborted) return;
      setMode(data.mode);
      if (data.mode === 'pins') {
        setEvents(data.events);
        setCells([]);
      } else {
        setCells(data.cells);
        setEvents([]);
      }
      setViewTotal(data.total ?? 0);
      setViewTruncated(!!data.truncated);
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[viewport] fetch failed', e);
    }
  }
  fetchViewportRef.current = fetchViewport;

  // Refetch on map init + any filter change. Panning/zooming is handled by the
  // debounced 'moveend' listener bound once in the map-init effect above (reads
  // fetchViewportRef.current so it always calls the latest closure). Gated on
  // mapInit, NOT mapLoaded: the fetch must not depend on the basemap style CDN.
  useEffect(() => {
    if (!mapInit) return;
    fetchViewport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInit, kindFilter, cats, freeOnly, kidsOnly, communityOnly, inOut, tod, dFrom, dTo]);

  // Common filters (category, free, kids, indoor/outdoor, search) apply to both
  // kinds. Date chips and time-of-day only make sense for events — places are
  // evergreen and must never be hidden by them (design doc rule). The viewport
  // itself is the spatial filter now (server-side, via fetchViewport below) —
  // there is no client-side radius predicate anymore.
  const commonFiltered = useMemo(() => {
    if (!events) return [];
    return events.filter((ev) => {
      if (cats.length && !ev.categories.some((c) => cats.includes(c))) return false;
      if (freeOnly && ev.is_free !== 1) return false;
      if (kidsOnly && !isForKids(ev)) return false;
      if (communityOnly && !isCommunitySubmitted(ev)) return false;
      if (inOut === 'in' && ev.indoor !== 1) return false;
      if (inOut === 'out' && ev.indoor !== 0) return false;
      if (deferredSearch.trim()) {
        const q = deferredSearch.trim().toLowerCase();
        const catLabels = (ev.categories || []).map((c) => t.cats[c] || c).join(' ');
        const hay = `${ev.title} ${ev.venue || ''} ${ev.town || ''} ${catLabels}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, cats, freeOnly, kidsOnly, communityOnly, inOut, deferredSearch, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEvents = useMemo(() => {
    if (kindFilter === 'place') return [];
    return commonFiltered
      .filter((ev) => ev.kind !== 'place')
      .filter((ev) => {
        const d = ev.starts_at.slice(0, 10);
        const dEnd = (ev.ends_at || ev.starts_at).slice(0, 10);
        if (dEnd < dFrom || d > dTo) return false;
        // Mirrors the server predicate in lib/db.js commonFilters — an event with
        // no published time can't be bucketed, so a bucket must not hide it.
        if (!inTimeOfDay(ev, tod)) return false;
        return true;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [commonFiltered, kindFilter, dFrom, dTo, tod]);

  const filteredPlaces = useMemo(() => {
    if (kindFilter === 'event') return [];
    return commonFiltered
      .filter((ev) => ev.kind === 'place')
      .sort((a, b) => distKm(refPoint, a) - distKm(refPoint, b));
  }, [commonFiltered, kindFilter, refPoint]);

  const filtered = useMemo(() => [...filteredEvents, ...filteredPlaces], [filteredEvents, filteredPlaces]);

  // Map grammar, in order: resolved event coordinates → same-series collapse →
  // safe same-venue collapse → generic spatial clustering. Every occurrence
  // remains independently available in the list and detail view.
  const seriesGroups = useMemo(() => groupEventSeries(filteredEvents), [filteredEvents]);

  const seriesCollapsedItems = useMemo(() => {
    const seen = new Set();
    const items = [];
    for (const ev of filtered) {
      if (ev.kind === 'place') { items.push(ev); continue; }
      const series = seriesGroups.byId.get(ev.id);
      if (!series) { items.push(ev); continue; }
      if (seen.has(series)) continue;
      seen.add(series);
      items.push({
        ...series.anchor,
        _seriesCount: series.members.length,
        _seriesIds: series.members.map((member) => member.id),
      });
    }
    return items;
  }, [filtered, seriesGroups]);

  const venueGroups = useMemo(() => groupEventsByVenue(seriesCollapsedItems), [seriesCollapsedItems]);

  const groupedMapItems = useMemo(() => {
    const seen = new Set();
    const reps = [];
    for (const ev of seriesCollapsedItems) {
      if (ev.kind === 'place') { reps.push(ev); continue; }
      const group = venueGroups.get(ev.id);
      if (!group || seen.has(group)) continue;
      seen.add(group);
      const representative = group.members.find((member) => member._seriesCount) || group.members[0];
      const memberIds = group.members.flatMap((member) => member._seriesIds || [member.id]);
      reps.push({
        ...representative,
        _venueCount: memberIds.length,
        _venueIds: memberIds,
      });
    }
    return reps;
  }, [seriesCollapsedItems, venueGroups]);

  // Map grammar split (design-system.md "the hard cap"): a pin claims "a venue
  // is here" — town-level positions (geo_precision:'town') can't support that
  // claim, so they never become individual pins, only the one dashed town-group
  // bubble per town (townGroupData below). Online/placeholder venues have no
  // physical place at all and never reach the map in any form — list/search only
  // (they stay in `filtered`/`groupedMapItems`, just excluded here).
  const mapEligible = useMemo(() => groupedMapItems.filter((ev) => !isOnlineVenue(ev)), [groupedMapItems]);
  const precisePinItems = useMemo(() => mapEligible.filter((ev) => ev.geo_precision !== 'town'), [mapEligible]);
  const townLevelItems = useMemo(() => mapEligible.filter((ev) => ev.geo_precision === 'town'), [mapEligible]);

  // One GeoJSON FeatureCollection over precise items only (no viewport culling —
  // GL draws thousands of sprites for free, that's the whole point). Each feature
  // carries everything the layers read: cat (→ sprite + color), community
  // (→ badge filter), count (venue/series "many here"). `id` is promoted for
  // feature-state selection. itemById/memberToRep feed click + flyTo (built here
  // so there's a single source of truth for the map's id→data lookups).
  const pinData = useMemo(() => {
    const itemById = new Map();
    const memberToRep = new Map();
    const features = precisePinItems.map((ev) => {
      const cat = primaryCat(ev);
      const count = ev._venueCount > 1 ? ev._venueCount : (ev._seriesCount > 1 ? ev._seriesCount : 0);
      const members = ev._venueIds || [ev.id]; // _venueIds already flattens series ids
      itemById.set(ev.id, ev);
      for (const m of members) memberToRep.set(m, ev.id);
      return {
        type: 'Feature',
        id: ev.id,
        geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
        properties: {
          id: ev.id,
          cat,
          color: CATS[cat].color, // token: CATS[cat].color (GL paint can't read --cc)
          community: isCommunitySubmitted(ev),
          count,
        },
      };
    });
    return { collection: { type: 'FeatureCollection', features }, itemById, memberToRep };
  }, [precisePinItems]);
  useEffect(() => { pinIndexRef.current = { itemById: pinData.itemById, memberToRep: pinData.memberToRep }; }, [pinData]);

  // One dashed bubble per (town, country) — the honest composition of "many"
  // (bubble + count, like the cluster bubbles) and "approximate" (dashed
  // outline, like the old per-pin halo), with the town NAME as a text label so
  // it never reads as a venue. count sums each representative's own already-
  // deduped venue/series count, so "12 events in X" stays a true count of
  // individual events, not of collapsed representatives.
  const townGroupData = useMemo(() => {
    const byKey = new Map();
    for (const ev of townLevelItems) {
      const key = `${(ev.town || '').toLowerCase()}|${ev.country || 'AT'}`;
      const count = ev._venueCount > 1 ? ev._venueCount : (ev._seriesCount > 1 ? ev._seriesCount : 1);
      let g = byKey.get(key);
      if (!g) { g = { town: ev.town, country: ev.country || 'AT', lat: ev.lat, lng: ev.lng, count: 0 }; byKey.set(key, g); }
      g.count += count;
    }
    const groups = [...byKey.values()];
    return {
      type: 'FeatureCollection',
      features: groups.map((g, i) => ({
        type: 'Feature',
        id: i,
        geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
        properties: { town: g.town, country: g.country, count: g.count, label: abbreviateCount(g.count) },
      })),
    };
  }, [townLevelItems]);
  const townGroupDataRef = useRef(townGroupData);
  townGroupDataRef.current = townGroupData;

  // Overview clusters: MapLibre spatial clustering so a regional view of hundreds
  // of results stays scannable. Feeds from mapEligible (precise + town-level, no
  // online) rather than the town-collapsed set — a town group of 12 must still
  // count as 12 points here, not 1, or zooming out would understate the total.
  const clusterData = useMemo(() => ({
    type: 'FeatureCollection',
    features: mapEligible.map((ev) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
      properties: { color: CATS[primaryCat(ev)].color },
    })),
  }), [mapEligible]);
  const clusterDataRef = useRef(clusterData);
  clusterDataRef.current = clusterData;

  // Below ZOOM_TIER the server sends pre-aggregated cells instead of rows (no
  // per-event data exists client-side to cluster) — mapped into the same
  // point_count / point_count_abbreviated properties MapLibre's own supercluster
  // output uses, so the bubble/count layers below can share their paint/layout
  // 1:1 with the cluster layers and look pixel-identical.
  const cellsData = useMemo(() => ({
    type: 'FeatureCollection',
    features: cells.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { point_count: c.n, point_count_abbreviated: abbreviateCount(c.n) },
    })),
  }), [cells]);
  const cellsDataRef = useRef(cellsData);
  cellsDataRef.current = cellsData;

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const install = () => {
      const existing = map.getSource('result-clusters');
      if (existing) {
        existing.setData(clusterDataRef.current);
      } else {
        map.addSource('result-clusters', {
          type: 'geojson', data: clusterDataRef.current, cluster: true, clusterMaxZoom: 12, clusterRadius: 48,
        });
        map.addLayer({
          id: 'result-cluster-bubbles', type: 'circle', source: 'result-clusters', maxzoom: HANDOFF_HIGH + 0.05,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#26332f', 'circle-opacity': CLUSTER_FADE_OUT(0.93),
            'circle-radius': ['step', ['get', 'point_count'], 17, 25, 21, 100, 26],
            'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': CLUSTER_FADE_OUT(1),
          },
        });
        map.addLayer({
          id: 'result-cluster-counts', type: 'symbol', source: 'result-clusters', maxzoom: HANDOFF_HIGH + 0.05,
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Bold'] },
          paint: { 'text-color': '#ffffff', 'text-opacity': CLUSTER_FADE_OUT(1) },
        });
        map.addLayer({
          id: 'result-overview-points', type: 'circle', source: 'result-clusters', maxzoom: HANDOFF_HIGH + 0.05,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'color'], 'circle-radius': 8.5, 'circle-opacity': CLUSTER_FADE_OUT(0.94),
            'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': CLUSTER_FADE_OUT(1),
          },
        });
        // Clicks are routed by the single map-level handler (bubble → pin →
        // overview point → deselect) — layer click handlers would race it.
        for (const layer of ['result-cluster-bubbles', 'result-overview-points']) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
        }
      }
      const existingCells = map.getSource('result-cells');
      if (existingCells) {
        existingCells.setData(cellsDataRef.current);
      } else {
        // maxzoom sits at HANDOFF_LOW, not ZOOM_TIER: the two sources are
        // mutually exclusive in settled state (cells mode → events=[], pins
        // mode → cells=[]), so no doubled visuals — but during the ~400ms
        // debounce + fetch after crossing the tier zooming IN, stale cells
        // keep rendering instead of a blank map (review finding #5).
        map.addSource('result-cells', { type: 'geojson', data: cellsDataRef.current });
        map.addLayer({
          id: 'result-cell-bubbles', type: 'circle', source: 'result-cells', maxzoom: HANDOFF_LOW,
          paint: {
            'circle-color': '#26332f', 'circle-opacity': 0.93,
            'circle-radius': ['step', ['get', 'point_count'], 17, 25, 21, 100, 26],
            'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff', 'circle-stroke-opacity': 1,
          },
        });
        map.addLayer({
          id: 'result-cell-counts', type: 'symbol', source: 'result-cells', maxzoom: HANDOFF_LOW,
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Bold'] },
          paint: { 'text-color': '#ffffff', 'text-opacity': 1 },
        });
        map.on('mouseenter', 'result-cell-bubbles', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'result-cell-bubbles', () => { map.getCanvas().style.cursor = ''; });
      }
    };
    // Gate on 'load' having fired (mapLoaded), NOT map.isStyleLoaded() — that
    // flag is false whenever the style is dirty, and a once('load') fallback
    // after the real 'load' never fires. addSource/addLayer are safe post-load.
    if (mapLoaded) install();
  }, [clusterData, cellsData, mapLoaded]);

  // Detail pins — the all-GL replacement for the old DOM markers. One non-clustered
  // source with promoteId:'id' (feature-state selection needs stable ids; a
  // separate source, not the clustered one, because setFeatureState is unreliable
  // on cluster:true sources). Every symbol layer is icon/text-allow-overlap:true —
  // collision hiding is what made pins "randomly disappear", so it's forbidden.
  // Selection = a soft halo (feature-state opacity) + a slightly larger pin drawn
  // on top (feature-state opacity, a PAINT prop that re-evaluates per frame; a
  // layout icon-size bump wouldn't, since symbol layout is computed in the worker).
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !spritesReady) return;
    const install = () => {
      const src = map.getSource('result-pins');
      if (src) { src.setData(pinData.collection); return; }
      map.addSource('result-pins', { type: 'geojson', data: pinData.collection, promoteId: 'id' });
      const SEL = ['boolean', ['feature-state', 'selected'], false];
      // Selection halo — only ring/scale may signal selection (design-system.md).
      // A per-category silhouette sprite, so the halo is teardrop-shaped on event
      // pins and circular on places (a circle halo on a teardrop reads wrong).
      map.addLayer({
        id: 'pin-selected-halo', type: 'symbol', source: 'result-pins', minzoom: HANDOFF_LOW,
        layout: {
          'icon-image': ['concat', 'halo-', ['get', 'cat']],
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center',
        },
        paint: {
          // ramps with the handoff band like the base pin ('zoom' must be the
          // top-level interpolate — a ['*', …, PIN_FADE_IN] product is invalid GL)
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], HANDOFF_LOW, 0, HANDOFF_HIGH, ['case', SEL, 0.3, 0]],
        },
      });
      // Base pins.
      map.addLayer({
        id: 'pins', type: 'symbol', source: 'result-pins', minzoom: HANDOFF_LOW,
        layout: {
          'icon-image': ['concat', 'pin-', ['get', 'cat']],
          'icon-allow-overlap': true, 'text-allow-overlap': true,
          'icon-ignore-placement': true, 'icon-anchor': 'center',
        },
        paint: { 'icon-opacity': PIN_FADE_IN },
      });
      // Selected pin drawn on top at 1.28× — the scale bump. Fully opaque only for
      // the selected feature, so it covers the base pin; invisible otherwise.
      map.addLayer({
        id: 'pins-selected', type: 'symbol', source: 'result-pins', minzoom: HANDOFF_LOW,
        layout: {
          'icon-image': ['concat', 'pin-', ['get', 'cat']], 'icon-size': 1.28,
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center',
        },
        paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], HANDOFF_LOW, 0, HANDOFF_HIGH, ['case', SEL, 1, 0]] },
      });
      // Count badge (venue group or same-title series), ink, top-right. Circle +
      // text; translate in viewport space so it stays top-right of the pin.
      map.addLayer({
        id: 'pin-badges', type: 'circle', source: 'result-pins', minzoom: HANDOFF_LOW,
        filter: ['>', ['get', 'count'], 1],
        paint: {
          'circle-color': '#212b28', 'circle-radius': 8, // token: --ink #212b28
          'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
          'circle-translate': [13, -13], 'circle-translate-anchor': 'viewport',
          // viewport pitch behavior to match the symbol pins — default 'map'
          // pitch-scale resizes circles on a tilted map while icons/text don't
          'circle-pitch-alignment': 'viewport', 'circle-pitch-scale': 'viewport',
          'circle-opacity': PIN_FADE_IN, 'circle-stroke-opacity': PIN_FADE_IN,
        },
      });
      map.addLayer({
        id: 'pin-badge-counts', type: 'symbol', source: 'result-pins', minzoom: HANDOFF_LOW,
        filter: ['>', ['get', 'count'], 1],
        layout: {
          'text-field': ['case', ['>', ['get', 'count'], 99], '99+', ['to-string', ['get', 'count']]],
          'text-size': 10, 'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': true, 'text-ignore-placement': true,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': '#ffffff', 'text-opacity': PIN_FADE_IN,
          // px translate matching the badge circle exactly — text-offset is in ems
          // (×text-size), which put the digit ~4px off the circle centre.
          'text-translate': [13, -13], 'text-translate-anchor': 'viewport',
        },
      });
      // Community (genuinely user-submitted) trust dot, --community, top-left.
      map.addLayer({
        id: 'pin-community', type: 'circle', source: 'result-pins', minzoom: HANDOFF_LOW,
        filter: ['==', ['get', 'community'], true],
        paint: {
          'circle-color': '#e59500', 'circle-radius': 5.5, // token: --community #e59500
          'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
          'circle-translate': [-12, -12], 'circle-translate-anchor': 'viewport',
          'circle-pitch-alignment': 'viewport', 'circle-pitch-scale': 'viewport',
          'circle-opacity': PIN_FADE_IN, 'circle-stroke-opacity': PIN_FADE_IN,
        },
      });
      map.on('mouseenter', 'pins', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'pins', () => { map.getCanvas().style.cursor = ''; });
    };
    // spritesReady only flips after 'load' has fired (registration runs in the
    // load handler), so install can run directly. The old isStyleLoaded() check
    // was ~always false here — addImage dirties the style — and its once('load')
    // fallback never fired ('load' already happened), so the pin layers were
    // never installed at all: zooming past the clusters showed an empty map.
    install();
  }, [pinData, spritesReady]);

  // Town-group bubbles — one dashed neutral marker per town standing in for
  // every town-level item there (never individual pins, see mapEligible split
  // above). Same minzoom/fade band as `pins` so it crossfades with the overview
  // clusters exactly like pins do, instead of popping in on its own schedule.
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !spritesReady) return;
    const install = () => {
      const src = map.getSource('result-town-groups');
      if (src) { src.setData(townGroupDataRef.current); return; }
      map.addSource('result-town-groups', { type: 'geojson', data: townGroupDataRef.current });
      map.addLayer({
        id: 'town-group-bubbles', type: 'symbol', source: 'result-town-groups', minzoom: HANDOFF_LOW,
        layout: { 'icon-image': 'town-bubble', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center' },
        paint: { 'icon-opacity': PIN_FADE_IN },
      });
      // Count, centered inside the bubble — ink text on the bubble's pale fill.
      map.addLayer({
        id: 'town-group-counts', type: 'symbol', source: 'result-town-groups', minzoom: HANDOFF_LOW,
        layout: {
          'text-field': ['get', 'label'], 'text-size': 10.5, 'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': true, 'text-ignore-placement': true, 'text-anchor': 'center',
        },
        paint: { 'text-color': '#212b28', 'text-opacity': PIN_FADE_IN }, // token: --ink
      });
      // Town name, below the bubble — the label that stops this reading as a venue.
      map.addLayer({
        id: 'town-group-labels', type: 'symbol', source: 'result-town-groups', minzoom: HANDOFF_LOW,
        layout: {
          'text-field': ['get', 'town'], 'text-size': 11, 'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': true, 'text-ignore-placement': true,
          'text-anchor': 'top', 'text-offset': [0, 1.3], 'text-max-width': 8,
        },
        paint: {
          'text-color': '#212b28', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4, // token: --ink
          'text-opacity': PIN_FADE_IN,
        },
      });
      map.on('mouseenter', 'town-group-bubbles', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'town-group-bubbles', () => { map.getCanvas().style.cursor = ''; });
    };
    install();
  }, [townGroupData, spritesReady]);

  // Selection → feature-state. React `selected` is the driver; a list row that's a
  // group member lights its representative pin. Re-applied on pinData/spritesReady
  // because GeoJSONSource.setData clears feature state.
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !map.getSource('result-pins')) return;
    const prev = pinSelRef.current;
    if (prev != null) { try { map.setFeatureState({ source: 'result-pins', id: prev }, { selected: false }); } catch {} }
    let next = null;
    if (selected) next = pinIndexRef.current.memberToRep.get(selected.id) ?? selected.id;
    if (next != null) { try { map.setFeatureState({ source: 'result-pins', id: next }, { selected: true }); } catch {} }
    pinSelRef.current = next;
  }, [selected?.id, pinData, spritesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected || !events) return;
    // Only auto-deselect when the selection came from the loaded viewport rows
    // and a chip toggle just filtered it out. A selection from search/saved (not
    // in `events` — likely off-viewport) must survive filter/viewport changes;
    // the user explicitly asked for it.
    if (!events.some((e) => e.id === selected.id)) return;
    const visible = new Set(filtered.map((e) => e.id));
    if (!visible.has(selected.id)) selectEvent(null, { fly: false });
  }, [filtered, events]); // eslint-disable-line react-hooks/exhaustive-deps

  // advancedFilterCount = filters that live INSIDE the panel (drives the ⚙ badge).
  // inOut is now a quick chip (Indoor/Outdoor), so it counts as active, not advanced.
  const advancedFilterCount = cats.length + tod.length + (communityOnly ? 1 : 0);
  const activeFilterCount = advancedFilterCount + (freeOnly ? 1 : 0) + (kidsOnly ? 1 : 0) + (inOut !== 'any' ? 1 : 0);
  function resetFilters() {
    setCats([]); setFreeOnly(false); setKidsOnly(false); setCommunityOnly(false); setInOut('any'); setTod([]);
  }

  /* ---------------- scan flow ---------------- */
  // The intake screen (scanState 'pick'): one drop zone (tap/drag/paste an
  // image → scan) + a paste-a-link field (→ /api/extract-url) + "type it in
  // manually". Every input converges on the shared confirm screen.
  function openCapture() {
    setCapture(true); setScanState('pick'); setScanImg(null); setScanErr(''); setDraft(null); setManualEntry(false);
    setMapPick(false); setUrlInput(''); setRefine(null); setAddrSuggestions([]); setAddrSuggestOpen(false); setDupNotice(null);
  }
  // "Type it in manually" reuses the exact same confirm-screen UI as the scan
  // flow, just pre-seeded with empty fields and skipping the photo/extraction
  // steps. Defaults to an event; the Event|Place switch flips draft.kind.
  function openManualAdd() {
    setCapture(true); setScanState('confirm'); setScanImg(null); setScanErr(''); setPhotoPath(null); setManualEntry(true);
    setMapPick(false); setRefine(null); setAddrSuggestions([]); setAddrSuggestOpen(false); setDupNotice(null);
    setDraft({
      kind: 'event', title: '', date_start: todayStr(), time_start: '', date_end: '', time_end: '', venue: '', address: '', town: 'Linz', lat: null, lng: null,
      categories: [], is_free: false, description: '', confidence: {},
      always_open: false, hours: {}, seasonal: '',
    });
  }
  // The Event|Place segmented switch on the confirm screen. Fills in whichever
  // kind's extra fields are missing so either direction is lossless.
  function setDraftKind(kind) {
    setDraft((d) => {
      if (!d || d.kind === kind) return d;
      if (kind === 'place') return { ...d, kind: 'place', always_open: d.always_open ?? false, hours: d.hours || {}, seasonal: d.seasonal || '' };
      return { ...d, kind: 'event', date_start: d.date_start || todayStr(), time_start: d.time_start || '' };
    });
  }
  function handleContributionLimit(res, data, action, restoreState) {
    if (res.status !== 429) return false;
    const defaults = action === 'ai_intake'
      ? { action, scope: 'network', window: 'hour', max: 4, perHour: 4, perDay: 10 }
      : { action, scope: 'network', window: 'hour', max: 5, perHour: 5, perDay: 15 };
    const notice = { ...defaults, ...(data?.rateLimit || {}) };
    setLimitNotice(notice);
    setScanErr('');
    setScanState(restoreState);
    track('contribution_rate_limited', { action: notice.action, scope: notice.scope, window: notice.window });
    return true;
  }
  async function handleFile(file) {
    if (!file) return;
    setScanErr('');
    let blob;
    try {
      blob = await downscale(file);
    } catch {
      setScanErr(t.imgFormatErr);
      return;
    }
    setScanImg(URL.createObjectURL(blob));
    setScanState('scanning');
    const fd = new FormData();
    fd.append('image', blob, 'scan.jpg');
    fd.append('lat', String(me.lat));
    fd.append('lng', String(me.lng));
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'X-Okolo-Lang': lang }, body: fd });
      const data = await res.json();
      if (handleContributionLimit(res, data, 'ai_intake', 'pick')) return;
      // A failed read (unparseable model output, provider down, garbled poster)
      // must never dead-end: keep the photo, drop into the same confirm form
      // pre-seeded empty, and tell the user to fill it in by hand. The scan is a
      // shortcut, not a gate — the only hard requirements land at publish time.
      if (!res.ok || !data.extraction) {
        setScanErr(t.scanFallbackManual);
        setPhotoPath(data.photo_path || null);
        setDupNotice(null);
        setManualEntry(true);
        setDraft({
          kind: 'event', title: '', date_start: '', time_start: '', date_end: '', time_end: '',
          venue: '', address: '', town: '', lat: null, lng: null,
          categories: [], is_free: false, description: '', confidence: {},
          always_open: false, hours: {}, seasonal: '',
        });
        setScanState('confirm');
        return;
      }
      const x = data.extraction;
      // Partial or non-event reads are expected, not errors — surface a soft
      // nudge and let the user complete whatever the AI couldn't read.
      if (!x.is_event) setScanErr(t.noEventDetected);
      setPhotoPath(data.photo_path);
      setDupNotice(data.duplicate || null);
      setDraft({
        kind: 'event',
        title: x.title || '',
        date_start: x.date_start || '',
        time_start: x.time_start || '',
        date_end: x.date_end || '',
        time_end: x.time_end || '',
        venue: x.venue || '',
        address: x.address || '',
        town: x.town || '', // never default a town — fabricated locations break trust (hard rule 5)
        lat: null, lng: null,
        categories: (x.categories || []).filter((c) => CATS[c]),
        is_free: x.is_free === true,
        description: x.description || '',
        confidence: x.confidence || { title: 0, datetime: 0, location: 0 },
      });
      setScanState('confirm');
    } catch (e) {
      // Network/JSON failure before we even got a response — same principle:
      // fall through to the manual form rather than bouncing back to the start.
      setScanErr(t.scanFallbackManual);
      setPhotoPath(null);
      setManualEntry(true);
      setDraft({
        kind: 'event', title: '', date_start: '', time_start: '', date_end: '', time_end: '',
        venue: '', address: '', town: '', lat: null, lng: null,
        categories: [], is_free: false, description: '', confidence: {},
        always_open: false, hours: {}, seasonal: '',
      });
      setScanState('confirm');
    }
  }
  // Link pipeline: server-side fetch + JSON-LD/OG/AI cascade (/api/extract-url),
  // then the same confirm screen as a poster scan. A blocked/login-walled/
  // event-less page comes back with fallback:true — we surface the nudge and
  // stay on the intake screen where the camera drop zone is one tap away.
  async function handleUrl(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url || urlBusy.current) return; // guard against double-submit (button + paste + Enter)
    urlBusy.current = true;
    setScanErr(''); setScanImg(null); setScanState('scanning');
    try {
      const res = await fetch('/api/extract-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Okolo-Lang': lang }, body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (handleContributionLimit(res, data, 'ai_intake', 'pick')) return;
      if (!res.ok) { setScanErr(data.error || t.extractionFailed); setScanState('pick'); return; }
      const x = data.extraction;
      const place = x.kind === 'place';
      setPhotoPath(null); setDupNotice(null);
      setDraft({
        kind: place ? 'place' : 'event',
        title: x.title || '',
        date_start: x.date_start || '',
        time_start: x.time_start || '',
        date_end: x.date_end || '',
        time_end: x.time_end || '',
        venue: x.venue || '',
        address: x.address || '',
        town: x.town || '', // never default a town — fabricated locations break trust (hard rule 5)
        lat: null, lng: null,
        categories: (x.categories || []).filter((c) => CATS[c]),
        is_free: x.is_free === true,
        description: x.description || '',
        confidence: x.confidence || { title: 0, datetime: 0, location: 0 },
        source_url: data.source_url || url,
        always_open: false, hours: {}, seasonal: '',
      });
      setScanState('confirm');
    } catch (e) {
      setScanErr(String(e.message || e));
      setScanState('pick');
    } finally {
      urlBusy.current = false;
    }
  }
  // Location picking on the MAIN map. Enter → collapse the form to a slim bar
  // (mobile) / keep it live (desktop) and drop a fixed centre crosshair; the
  // moveend effect reverse-geocodes the settled centre into address+town.
  function enterMapPick() {
    mapPickSnapshot.current = { lat: draft.lat, lng: draft.lng, address: draft.address, town: draft.town };
    const start = draft.lat != null ? { lat: draft.lat, lng: draft.lng } : (searchCenter || me);
    setDraft((d) => ({ ...d, lat: start.lat, lng: start.lng }));
    setMapPick(true);
    flyProgrammatic([start.lng, start.lat], Math.max(mapObj.current?.getZoom() || 0, 15));
  }
  async function confirmMapPick() {
    const c = mapObj.current?.getCenter();
    clearTimeout(reverseDebounce.current);
    const reqId = ++reverseReqId.current; // invalidates any in-flight drag lookup
    if (c) setDraft((d) => ({ ...d, lat: c.lat, lng: c.lng }));
    // Restore the form immediately; Nominatim may take a few seconds. The
    // resolved label fills in behind it without making Confirm feel stuck.
    setMapPick(false);
    if (!c) return;
    try {
      const res = await fetch(`/api/geocode?reverse=1&lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}`);
      const data = await res.json();
      if (reqId !== reverseReqId.current) return;
      const address = data.address;
      if (address) setDraft((d) => ({ ...d, address: address.address ?? d.address, town: address.town || d.town }));
    } catch { /* coordinates remain valid even if the label lookup fails */ }
  }
  function cancelMapPick() {
    const s = mapPickSnapshot.current;
    if (s) setDraft((d) => ({ ...d, lat: s.lat, lng: s.lng, address: s.address, town: s.town }));
    setMapPick(false);
  }
  async function finishPublish() {
    track('contribution_published', { kind: draft.kind === 'place' ? 'place' : 'event', via: photoPath ? 'scan' : draft.source_url ? 'link' : 'form' });
    setCapture(false);
    setManualEntry(false);
    setRefine(null);
    const freshEvents = await loadEvents();
    showToast(t.toastLive);
    setWhenMode('all');
    return freshEvents;
  }
  async function publish() {
    const isPlace = draft.kind === 'place';
    // Town is required, never defaulted — a fabricated location is worse than a
    // missing event (hard rule 5), and the server geocodes town → coords.
    if (!draft.title || !draft.town?.trim() || (!isPlace && !draft.date_start)) {
      setScanErr(isPlace ? t.requiredErrPlace : t.requiredErr);
      return;
    }
    setScanState('publishing');
    // Known coordinates (from the map pin-drop or a picked address suggestion) are
    // trusted over server-side geocoding whenever we have them, for either kind.
    const coordsPatch = draft.lat != null ? { lat: draft.lat, lng: draft.lng, geo_precision: 'address' } : {};
    const placeHours = buildOpeningHours(draft.hours);
    // Preserve a multi-day / explicit end so date-range filtering and the ICS
    // export don't collapse it to a single day. Timed end only when timed start.
    const timed = /^\d{2}:\d{2}$/.test(draft.time_start);
    const endsAt = draft.date_end && draft.date_end >= draft.date_start
      ? `${draft.date_end}T${timed && /^\d{2}:\d{2}$/.test(draft.time_end) ? draft.time_end : (timed ? draft.time_start : '23:59')}`
      : null;
    const body = isPlace
      ? {
          kind: 'place',
          title: draft.title,
          description: draft.description || null,
          venue: draft.venue || null,
          address: draft.address || null,
          town: draft.town.trim(),
          categories: draft.categories,
          is_free: draft.is_free,
          opening_hours: draft.always_open ? { always: true } : Object.keys(placeHours).length ? placeHours : null,
          seasonal: draft.seasonal || null,
          ...coordsPatch,
        }
      : {
          kind: 'event',
          title: draft.title,
          description: draft.description || null,
          starts_at: makeStartsAt(draft.date_start, timed ? draft.time_start : null),
          ...(endsAt ? { ends_at: endsAt } : {}),
          // Leaving the time field empty means "I don't know the time", not "it
          // runs all day" — don't turn the user's silence into a claim either.
          all_day: false,
          venue: draft.venue || null,
          address: draft.address || null,
          town: draft.town.trim(),
          categories: draft.categories,
          is_free: draft.is_free,
          photo_path: photoPath,
          ...coordsPatch,
        };
    if (draft.source_url) body.source_url = draft.source_url; // link-pipeline linkback
    body.website = draft.website || ''; // honeypot — server rejects if filled
    try {
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Okolo-Lang': lang }, body: JSON.stringify(body) });
      const data = await res.json();
      if (handleContributionLimit(res, data, 'publish', 'confirm')) return;
      if (!res.ok) throw new Error(data.error || t.saveFailed);
      if (data.merged) {
        // This event was already on the map (crawled elsewhere, or scanned
        // once before) — our info enriched the existing row instead of
        // inserting a new one. Focus the map on that (now-enriched) row.
        const fresh = await finishPublish();
        const mergedEvent = fresh?.find((ev) => ev.id === data.id) || { id: data.id, lat: data.lat, lng: data.lng };
        selectRef.current(mergedEvent);
        return;
      }
      if (data.geo_precision === 'town' && data.lat != null) {
        // Low-precision geocode — offer the same pin-drop picker to refine it.
        // A re-POST with explicit lat/lng + the same content (same title/day/
        // town → same content_hash) updates this row's position in place.
        setRefine({ body, lat: data.lat, lng: data.lng });
        setScanState('refine');
        return;
      }
      await finishPublish();
    } catch (e) {
      setScanErr(String(e.message || e));
      setScanState('confirm');
    }
  }
  async function confirmRefine(pos) {
    setScanState('publishing');
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Okolo-Lang': lang },
        body: JSON.stringify({ ...refine.body, lat: pos.lat, lng: pos.lng, geo_precision: 'address' }),
      });
      const data = await res.json();
      if (handleContributionLimit(res, data, 'publish', 'refine')) return;
      if (!res.ok) throw new Error(data.error || t.saveFailed);
      await finishPublish();
    } catch (e) {
      setScanErr(String(e.message || e));
      setScanState('refine');
    }
  }

  /* ---------------- shared subviews ---------------- */
  // Top-left locality label + expanding search. `compact` = floating pill over
  // the map (mobile); non-compact = a normal row inside the desktop sidebar.
  function locSearchBar(compact) {
    const locResults = [...orteMatches, ...geoMatches];
    const showOrte = locResults.length > 0 || geoLoading;
    return (
      <div className={`locsearch ${compact ? 'floaty' : ''}`}>
        <div className="locsearch-row">
          <div className={`searchpill ${searchOpen ? 'open' : ''}`}>
            <span className="searchpill-icon" aria-hidden="true"><MagnifyingGlass size={18} weight="bold" /></span>
            {searchOpen ? (
              <input
                autoFocus
                className="searchpill-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch();
                  // Enter takes the top location — the whole point of the
                  // ranking is that it's the one you meant.
                  if (e.key === 'Enter' && locResults.length > 0) selectLocation(locResults[0]);
                }}
                placeholder={t.searchPlaceholder}
              />
            ) : (
              <button type="button" className="searchpill-label" onClick={() => setSearchOpen(true)}>
                {t.searchPlaceholder}
              </button>
            )}
            {searchOpen && (
              <button type="button" className="searchpill-clear" onClick={closeSearch} aria-label={t.close}>
                <X size={16} weight="bold" />
              </button>
            )}
          </div>
          <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label={t.menu}>
            <List size={23} weight="bold" />
          </button>
          {menuOpen && (
            <>
              <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="menudrop">
                <button className="menuitem" onClick={() => { setMenuOpen(false); setSavedOpen(true); }}>
                  <span className="ic">🔖</span>{t.savedMenu}
                  {saved.length > 0 && <span className="menucount">{saved.length}</span>}
                </button>
                <button className="menuitem" onClick={() => { setMenuOpen(false); openNewsletter(); }}>
                  <span className="ic">✉️</span>{t.newsletter}
                </button>
                <button className="menuitem" onClick={() => { setMenuOpen(false); setAdvertiseOpen(true); }}>
                  <span className="ic">📣</span>{t.advertise}
                </button>
                <div className="language-picker">
                  <div className="language-label"><span className="ic">🌐</span>{t.language}</div>
                  <div className="language-options" role="radiogroup" aria-label={t.language}>
                    {LANGS.map((code) => (
                      <button
                        key={code}
                        type="button"
                        role="radio"
                        aria-checked={lang === code}
                        className={lang === code ? 'selected' : ''}
                        onClick={() => { chooseLanguage(code); setMenuOpen(false); }}
                      >
                        <span>{LANGUAGE_NAMES[code]}</span><span aria-hidden="true">{lang === code ? '✓' : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="menu-legal">
                  <a href="/impressum" target="_blank" rel="noreferrer">{t.imprint}</a>
                  <span>·</span>
                  <a href="/datenschutz" target="_blank" rel="noreferrer">{t.privacyLink}</a>
                </div>
                {/* Future: Account / Login entry goes here — add one more <button className="menuitem"> */}
              </div>
            </>
          )}
        </div>
        {searchCenter && !searchOpen && (
          <button className="searchcenter-chip" onClick={clearSearchCenter}>
            {t.searchCenterChip.replace('{ort}', searchCenter.label)} <span className="x">✕</span>
          </button>
        )}
        {searchOpen && searchQuery.trim() && (
          <div className="search-results">
            {showOrte && (
              <div className="search-section">
                <div className="search-sechead">{t.searchSectionLocations}</div>
                {locResults.map((loc) => (
                  <button key={`${loc.label}:${loc.lat}`} className="search-row loc" onClick={() => selectLocation(loc)}>
                    📍 {loc.label}
                    {loc.hint && <span>{loc.hint}</span>}
                  </button>
                ))}
                {locResults.length === 0 && geoLoading && <div className="search-loading">{t.searching}</div>}
              </div>
            )}
            <div className="search-section">
              <div className="search-sechead">{t.searchSectionEvents}</div>
              {qResults.map((ev) => (
                <button key={ev.id} className="search-row" onClick={() => selectSearchResult(ev)}>
                  {ev.title}
                  <span>{[ev.town, ev.venue].filter(Boolean).join(', ')}</span>
                </button>
              ))}
              {qResults.length === 0 && qLoading && <div className="search-loading">{t.searching}</div>}
              {qResults.length === 0 && !qLoading && <div className="search-empty">{t.emptyTitle}</div>}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Kind is single-select (mutually exclusive), so it wears the segmented-
  // control vocabulary — visually distinct from the multi-select toggle chips
  // below, per the design system's two grammars (.seg vs .chip).
  const kindToggle = (
    <div className="seg" style={{ width: '100%' }}>
      {[['all', t.kindAll], ['event', t.kindEvents], ['place', t.kindPlaces]].map(([k, label]) => (
        <button key={k} className={kindFilter === k ? 'on' : ''} onClick={() => setKindFilter(k)}>
          {label}
        </button>
      ))}
    </div>
  );

  const dateChips = (
    <>
      {[['today', t.today], ['tomorrow', t.tomorrow], ['weekend', t.weekend], ['next7', t.next7]].map(([k, label]) => (
        <button key={k} className={`chip ${whenMode === k ? 'on' : ''}`} onClick={() => setWhenMode(whenMode === k ? 'all' : k)}>
          {label}
        </button>
      ))}
      <button
        className={`chip ${whenMode === 'range' ? 'on' : ''}`}
        onClick={() => { setDpDraft(range); setDpOpen(true); }}
      >
        📅 {whenMode === 'range' && range.from ? fmtRangeChip(range.from, range.to, lang) : t.pickDate}
      </button>
    </>
  );

  const quickFilters = (
    <>
      <button className={`chip ${kidsOnly ? 'on' : ''}`} onClick={() => setKidsOnly(!kidsOnly)}>{t.forKids}</button>
      <button className={`chip ${freeOnly ? 'on' : ''}`} onClick={() => setFreeOnly(!freeOnly)}>{t.freeOnly}</button>
      <button className={`chip ${inOut === 'in' ? 'on' : ''}`} onClick={() => setInOut(inOut === 'in' ? 'any' : 'in')}>{t.indoor}</button>
      <button className={`chip ${inOut === 'out' ? 'on' : ''}`} onClick={() => setInOut(inOut === 'out' ? 'any' : 'out')}>{t.outdoor}</button>
    </>
  );

  const filterPanel = (
    <div className="filters">
      <div className="fgroup">
        <h4>{t.timeOfDay}</h4>
        <div className="seg">
          {[['morning', t.morning], ['afternoon', t.afternoon], ['evening', t.evening]].map(([k, label]) => (
            <button key={k} className={tod.includes(k) ? 'on' : ''} onClick={() => setTod(tod.includes(k) ? tod.filter((x) => x !== k) : [...tod, k])}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="fgroup">
        <h4>{t.categories}</h4>
        <div className="catgrid">
          {(kindFilter === 'event' ? EVENT_CATS : kindFilter === 'place' ? PLACE_CATS : [...EVENT_CATS, ...PLACE_CATS])
            .slice()
            .sort((a, b) => (t.cats[a] || a).localeCompare(t.cats[b] || b, lang))
            .map((key) => (
            <button
              key={key}
              className={`cat ${cats.includes(key) ? 'on' : ''}`}
              style={{ '--cc': CATS[key].color }}
              onClick={() => setCats(cats.includes(key) ? cats.filter((x) => x !== key) : [...cats, key])}
            >
              <CatIcon cat={key} size={13} />
              {t.cats[key]}
            </button>
          ))}
          {kindFilter !== 'place' && (
            <button
              className={`cat ${communityOnly ? 'on' : ''}`}
              style={{ '--cc': 'var(--community)' }}
              onClick={() => setCommunityOnly(!communityOnly)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="currentColor" /></svg>
              {t.communityOnly}
            </button>
          )}
        </div>
      </div>
      {activeFilterCount > 0 && <button className="resetbtn" onClick={resetFilters}>{t.reset}</button>}
    </div>
  );

  // Location/distance tail shared by event + place rows: online has neither (no
  // physical place to point to, see isOnlineVenue); town-level shows the honest
  // "in {town}" instead of a fabricated venue name, and an "≈" distance instead
  // of a precise one (the coordinate is a centroid, not where the event is).
  function locDistMeta(ev) {
    if (isOnlineVenue(ev)) return null;
    const km = distKm(refPoint, ev).toFixed(1).replace('.', ',');
    if (ev.geo_precision === 'town') return <> · {t.inTown.replace('{town}', ev.town)} · ≈{km} km</>;
    return <> · {ev.town || ev.venue} · {km} km</>;
  }

  function eventList(onPick) {
    // A tapped town-group bubble scopes the list to exactly that town's
    // town-level items (Task 2: never the single-event detail).
    const scoped = selectedTown
      ? filtered.filter((ev) => ev.geo_precision === 'town' && ev.town === selectedTown.town
          && (ev.country || 'AT') === selectedTown.country && !isOnlineVenue(ev))
      : null;
    const evs = scoped ? scoped.filter((ev) => ev.kind !== 'place') : filteredEvents;
    const pls = scoped ? scoped.filter((ev) => ev.kind === 'place') : filteredPlaces;
    let lastDay = null;
    const header = selectedTown && (
      <div className="town-group-header">
        <span className="tx">
          <b>{t.townGroupTitle.replace('{n}', scoped.length).replace('{town}', selectedTown.town)}</b>
          <span>{t.townGroupHint}</span>
        </span>
        <button className="m-close" onClick={() => setSelectedTown(null)} aria-label={t.close}><X size={14} weight="bold" /></button>
      </div>
    );
    if (evs.length === 0 && pls.length === 0) {
      return (
        <div className="list">
          {header}
          <div className="empty">
            {t.emptyTitle}
            <br />
            <button onClick={() => mapObj.current?.easeTo({ zoom: Math.max(0, mapObj.current.getZoom() - 2) })}>{t.zoomOut}</button>
            <br />
            <span>{t.knowOne} 📷</span>
          </div>
        </div>
      );
    }
    return (
      <div className="list">
        {header}
        {evs.map((ev) => {
          const d = ev.starts_at.slice(0, 10);
          const groupDay = d < dFrom ? 'ongoing' : d;
          const head = groupDay !== lastDay ? <div className="dayhead">{groupDay === 'ongoing' ? t.ongoing : fmtDayLong(d, lang, t)}</div> : null;
          lastDay = groupDay;
          const cat = primaryCat(ev);
          const community = isCommunitySubmitted(ev);
          const online = isOnlineVenue(ev);
          return (
            <div key={ev.id}>
              {head}
              <button className={`row ${whenMode === 'range' ? 'range-match' : ''} ${selected?.id === ev.id ? 'active' : ''}`} style={{ '--cc': CATS[cat].color }} onClick={() => onPick(ev)}>
                <span className="thumb"><CatIcon cat={cat} size={17} /></span>
                <span className="tx">
                  <span className="t">{ev.title}</span>
                  <span className="m">
                    {ev.all_day ? t.allDay : hasTime(ev.starts_at) ? ev.starts_at.slice(11, 16) : t.timeTbd}{locDistMeta(ev)}
                  </span>
                </span>
                {(community || online || ev.is_free === 1) && <span className="rowbadges">
                  {community && <span className="source-tag community">{t.communitySource}</span>}
                  {online && <span className="source-tag">{t.onlineBadge}</span>}
                  {ev.is_free === 1 && <span className="tag">{t.freeTag}</span>}
                </span>}
              </button>
            </div>
          );
        })}
        {pls.length > 0 && (
          <>
            {evs.length > 0 && <div className="dayhead">{t.kindPlaces}</div>}
            {pls.map((pl) => {
              const cat = primaryCat(pl);
              const st = openStatus(pl.opening_hours);
              const community = isCommunitySubmitted(pl);
              const online = isOnlineVenue(pl);
              return (
                <button key={pl.id} className={`row ${selected?.id === pl.id ? 'active' : ''}`} style={{ '--cc': CATS[cat].color }} onClick={() => onPick(pl)}>
                  <span className="thumb"><CatIcon cat={cat} size={17} /></span>
                  <span className="tx">
                    <span className="t">{pl.title}</span>
                    <span className="m">
                      {t.cats[cat]}{locDistMeta(pl)}
                    </span>
                  </span>
                  {(community || online || (!st.always && !st.unknown)) && <span className="rowbadges">
                    {community && <span className="source-tag community">{t.communitySource}</span>}
                    {online && <span className="source-tag">{t.onlineBadge}</span>}
                    {!st.always && !st.unknown && <span className={`tag ${st.open ? '' : 'closed'}`}>{st.open ? t.openNow : t.closedNow}</span>}
                  </span>}
                </button>
              );
            })}
          </>
        )}
      </div>
    );
  }

  function placeHoursBlock(ev) {
    const st = openStatus(ev.opening_hours);
    if (st.unknown) return null;
    if (st.always) return <div className="dwhen place-open always">{t.alwaysOpen}</div>;
    const today = st.ranges.map(([s, e]) => `${s}–${e}`).join(', ') || t.closedDay;
    return (
      <>
        <div className={`dwhen place-open ${st.open ? 'open' : 'closed'}`}>
          {st.open ? t.openNow : t.closedNow} · {today}
        </div>
        <details className="hourswk">
          <summary>{t.openingHours}</summary>
          <div className="hourslist">
            {DOW_ORDER.map((k, i) => {
              const ranges = ev.opening_hours?.[k] || [];
              return (
                <div key={k} className="hourrow">
                  <span>{t.weekdaysLong[i]}</span>
                  <span>{ranges.length ? ranges.map(([s, e]) => `${s}–${e}`).join(', ') : t.closedDay}</span>
                </div>
              );
            })}
          </div>
        </details>
      </>
    );
  }

  // Tapping a "more at this venue" row switches the open detail to that event
  // without collapsing the mobile full-screen sheet back to the mini-card.
  function switchToVenueEvent(item) {
    selectEvent(item);
    setDetailFull(true);
  }

  function eventDetail(ev, { onBack, onClose }) {
    const cat = primaryCat(ev);
    const place = ev.kind === 'place';
    const community = isCommunitySubmitted(ev);
    const series = seriesGroups.byId.get(ev.id);
    const seriesIds = new Set(series?.members.map((item) => item.id) || []);
    const seriesSiblings = (series?.members || [])
      .filter((item) => item.id !== ev.id)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    // Task 3: "more at this venue" — for an event, its venue-group siblings; for a
    // place, other upcoming events at/near it (same venue-matching rule).
    const venueSiblings = place
      ? (events || [])
          .filter((e) => e.kind !== 'place' && e.id !== ev.id && sameVenue(e, ev))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      : (events || [])
          .filter((e) => e.kind !== 'place' && e.id !== ev.id && !seriesIds.has(e.id) && sameVenue(e, ev))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return (
      <>
        <div className="dhero" style={{ '--cc': CATS[cat].color }}>
          <span className="heroicon"><CatIcon cat={cat} size={44} strokeWidth={1.6} /></span>
          {onBack && <button className="backbtn" onClick={onBack} aria-label={t.backToList}><ArrowLeft size={18} weight="bold" /></button>}
          {onClose && <button className="closebtn" onClick={onClose} aria-label={t.close}><X size={18} weight="bold" /></button>}
        </div>
        <div className="dbody">
          <h2>{ev.title}</h2>
          {/* Crowd-sourced correction, surfaced only once REPORT_MIN independent
              people agree (server-side). A wrong event destroys trust faster than
              a missing one — so say so loudly, above the details themselves. */}
          {ev.report_flag && t.reportFlags[ev.report_flag] && (
            <div className="dflag" role="status">
              <Warning size={17} weight="fill" />
              <span>{t.reportFlags[ev.report_flag]}</span>
            </div>
          )}
          {place ? placeHoursBlock(ev) : <div className="dwhen">{fmtWhen(ev, lang, t)}</div>}
          <div className="dtags">
            {(ev.categories || []).filter((c) => CATS[c]).map((c) => (
              <span key={c} className="dtag" style={{ '--cc': CATS[c].color }}>
                <CatIcon cat={c} size={11} /> {t.cats[c]}
              </span>
            ))}
            {ev.is_free === 1 && <span className="dtag" style={{ '--cc': 'var(--good)' }}>{t.freeTag}</span>}
            {ev.indoor === 1 && <span className="dtag" style={{ '--cc': 'var(--muted)' }}>{t.indoorTag}</span>}
            {ev.indoor === 0 && <span className="dtag" style={{ '--cc': 'var(--muted)' }}>{t.outdoorTag}</span>}
          </div>
          <div className="dmeta">
            {/* Town-level: never print the fabricated-looking venue/address join —
                the coordinate is a town centroid, not a place. Say so plainly. */}
            <div><span className="k">📍</span><span>
              {ev.geo_precision === 'town'
                ? <>{ev.town}<br /><span className="mutedt">{t.townGroupHint}</span></>
                : [ev.venue, ev.address, ev.town].filter(Boolean).join(', ') || '—'}
            </span></div>
            <div><span className="k">🚗</span><span className="mutedt">{distKm(refPoint, ev).toFixed(1).replace('.', ',')} km {t.away}</span></div>
            {!place && ev.age_min != null && (
              <div><span className="k">👨‍👩‍👧</span><span className="mutedt">{t.ageRec.replace('{min}', ev.age_min).replace('{max}', ev.age_max ?? '99')}</span></div>
            )}
            {place && ev.seasonal && (
              <div><span className="k">📅</span><span className="mutedt">{ev.seasonal}</span></div>
            )}
          </div>
          {ev.description && <p className="ddesc">{ev.description}</p>}
          <div className="prov">
            <span>{community ? (ev.src_kind === 'user_photo' ? '📷' : '👤') : '🌐'}</span>
            <span>
              {t.source}:{' '}
              {community ? (
                <>
                  <b>{t.communitySource}</b>
                  {ev.source_url && <> · <a href={ev.source_url} target="_blank" rel="noreferrer">{ev.source_url}</a></>}
                </>
              ) : ev.source_url ? (
                <a href={ev.source_url} target="_blank" rel="noreferrer">{ev.source_name || ev.source_url}</a>
              ) : (
                <b>{ev.source_name || t.uploadSource}</b>
              )}
            </span>
          </div>
          <div className="dactions2">
            <a className="daction" href={`https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}`} target="_blank" rel="noreferrer" onClick={() => track('directions', { kind: ev.kind, id: ev.id })}>
              <span className="daction-ic"><NavigationArrow size={19} weight="fill" /></span>
              <span className="daction-lab">{t.route}</span>
            </a>
            {!place && (
              <div className="daction-wrap">
                <button className="daction" onClick={() => setCalMenu(calMenu === ev.id ? false : ev.id)} aria-haspopup="true" aria-expanded={calMenu === ev.id}>
                  <span className="daction-ic"><CalendarPlus size={19} weight="bold" /></span>
                  <span className="daction-lab">{t.calendar}</span>
                </button>
                {calMenu === ev.id && (
                  <>
                    <div className="menu-scrim" onClick={() => setCalMenu(false)} />
                    <div className="calmenu">
                      <a className="calmenu-item" href={googleCalUrl(ev)} target="_blank" rel="noreferrer" onClick={() => { track('calendar_add', { target: 'google', id: ev.id }); setCalMenu(false); }}>
                        <span className="ic">📅</span>{t.calGoogle}
                      </a>
                      <a className="calmenu-item" href={outlookCalUrl(ev)} target="_blank" rel="noreferrer" onClick={() => { track('calendar_add', { target: 'outlook', id: ev.id }); setCalMenu(false); }}>
                        <span className="ic">📆</span>{t.calOutlook}
                      </a>
                      <button className="calmenu-item" onClick={() => { track('calendar_add', { target: 'ics', id: ev.id }); makeIcs(ev); setCalMenu(false); }}>
                        <span className="ic">🍏</span>{t.calIcs}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              className="daction"
              onClick={() => {
                track('share', { kind: ev.kind, id: ev.id });
                const url = `${location.origin}/event/${ev.id}`;
                if (navigator.share) navigator.share({ title: ev.title, url }).catch(() => {});
                else navigator.clipboard.writeText(url).then(() => showToast(t.copied));
              }}
            >
              <span className="daction-ic"><ShareNetwork size={19} weight="bold" /></span>
              <span className="daction-lab">{t.share}</span>
            </button>
            <button
              className={`daction ${isSaved(ev) ? 'on' : ''}`}
              onClick={() => toggleSaved(ev)}
              aria-pressed={isSaved(ev)}
            >
              <span className="daction-ic">
                <BookmarkSimple size={19} weight={isSaved(ev) ? 'fill' : 'bold'} />
              </span>
              <span className="daction-lab">
                {t.interested}
                {interestCount(ev) >= INTEREST_SHOW_MIN && <span className="daction-n">{interestCount(ev)}</span>}
              </span>
            </button>
          </div>
          {/* Enum-only, no free text: nothing here can be moderated, defamed with,
              or spam-linked — which is exactly why it needs no login. */}
          <div className="dreport">
            {reported.includes(ev.id) ? (
              <span className="dreport-done">{t.reportThanks}</span>
            ) : (
              <>
                <button className="dreport-btn" onClick={() => setReportMenu(reportMenu === ev.id ? false : ev.id)} aria-haspopup="true" aria-expanded={reportMenu === ev.id}>
                  <Flag size={14} weight="bold" /> {t.reportProblem}
                </button>
                {reportMenu === ev.id && (
                  <>
                    <div className="menu-scrim" onClick={() => setReportMenu(false)} />
                    <div className="reportmenu">
                      {['cancelled', 'wrong_time', 'wrong_info', 'not_free'].map((reason) => (
                        <button key={reason} className="reportmenu-item" onClick={() => sendReport(ev, reason)}>
                          {t.reportReasons[reason]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          {seriesSiblings.length > 0 && (
            <div className="dvenue dseries">
              <h4>{t.moreInSeries}</h4>
              <div className="dvenue-list">
                {seriesSiblings.map((s) => {
                  const sCat = primaryCat(s);
                  return (
                    <button key={s.id} className="dvenue-row" style={{ '--cc': CATS[sCat].color }} onClick={() => switchToVenueEvent(s)}>
                      <span className="thumb"><CatIcon cat={sCat} size={15} /></span>
                      <span className="tx">
                        <span className="t">{fmtWhenShort(s, lang, t)}</span>
                        <span className="m">{[s.venue, s.town].filter(Boolean).join(', ')}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {venueSiblings.length > 0 && (
            <div className="dvenue">
              <h4>{t.moreAtVenue}</h4>
              <div className="dvenue-list">
                {venueSiblings.map((s) => {
                  const sCat = primaryCat(s);
                  return (
                    <button key={s.id} className="dvenue-row" style={{ '--cc': CATS[sCat].color }} onClick={() => switchToVenueEvent(s)}>
                      <span className="thumb"><CatIcon cat={sCat} size={15} /></span>
                      <span className="tx">
                        <span className="t">{s.title}</span>
                        <span className="m">{fmtWhenShort(s, lang, t)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  const conf = draft?.confidence;
  const confChip = (v) => (v == null ? null : <span className={`conf ${v >= 0.6 ? 'hi' : 'lo'}`}>{Math.round(v * 100)} %</span>);

  const isPlaceDraft = draft?.kind === 'place';
  const captureView = (
    <section className={`capture ${capture ? 'show' : ''} ${scanState === 'pick' ? 'intake-sheet' : ''} ${mapPick ? 'mappick' : ''}`}>
      <div className="caphead">
        <h3>
          {scanState === 'pick' && t.addToMap}
          {scanState === 'scanning' && (scanImg ? t.scanReading : t.urlReading)}
          {scanState === 'confirm' && (isPlaceDraft ? t.addPlaceTitle : manualEntry ? t.addManual : t.scanConfirm)}
          {scanState === 'refine' && t.adjustPosition}
          {scanState === 'publishing' && t.scanPublishing}
        </h3>
        <button onClick={() => setCapture(false)}>{t.cancel}</button>
      </div>
      <div className="capbody">
        {scanErr && <div className="errbox">⚠️ {scanErr}</div>}
        {scanState === 'pick' && (
          <>
            {/* Gallery/file picker (all devices) + a camera-only input (mobile).
                capture="environment" makes the phone open the rear camera
                straight away instead of the file browser. */}
            <input ref={fileInput} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
            <div className="intake-card">
              {/* Order (George's call): link first, then photo, then manual. */}
              <div className="intake-url">
                <LinkSimple className="intake-url-icon" size={20} weight="bold" />
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUrl(urlInput); } }}
                  placeholder={t.intakeUrlPlaceholder}
                />
                <button type="button" className="intake-url-go" disabled={!urlInput.trim()} onClick={() => handleUrl(urlInput)}>
                  {t.intakeReadLink}
                </button>
              </div>

              {isDesktop ? (
                <button
                  type="button"
                  className="droparea"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('dragover');
                    const file = e.dataTransfer?.files?.[0];
                    if (file) handleFile(file);
                  }}
                >
                  <span className="intake-icon primary"><ImageSquare size={23} weight="bold" /></span>
                  <span className="intake-copy"><b>{t.scanUploadImage}</b><small>{t.scanPromptSub}</small></span>
                  <CaretRight className="intake-chevron" size={18} weight="bold" />
                </button>
              ) : (
                <>
                  <button type="button" className="intake-photo" onClick={() => cameraInput.current?.click()}>
                    <span className="intake-icon primary"><Camera size={21} weight="bold" /></span>
                    <span className="intake-copy"><b>{t.scanTakePhoto}</b><small>{t.scanPromptSub}</small></span>
                    <CaretRight className="intake-chevron" size={18} weight="bold" />
                  </button>
                  <button type="button" className="intake-photo" onClick={() => fileInput.current?.click()}>
                    <span className="intake-icon"><ImageSquare size={21} weight="bold" /></span>
                    <span>{t.scanUploadImage}</span>
                    <CaretRight className="intake-chevron" size={18} weight="bold" />
                  </button>
                </>
              )}

              <button type="button" className="intake-manual" onClick={openManualAdd}>
                <span className="intake-icon"><PencilSimple size={21} weight="bold" /></span>
                <span>{t.intakeManualLink}</span>
                <CaretRight className="intake-chevron" size={18} weight="bold" />
              </button>
            </div>
          </>
        )}
        {scanState === 'scanning' && (
          scanImg ? (
            <>
              <div className="preview">
                <img src={scanImg} alt="" />
                <div className="scanline-wrap"><div className="scanline" /></div>
              </div>
              <div className="scanstatus">{t.scanExtracting}</div>
            </>
          ) : (
            <div className="url-reading">
              <span className="big">🔗</span>
              <div className="scanstatus">{t.urlReading}</div>
            </div>
          )
        )}
        {scanState === 'refine' && refine && (
          <>
            <p className="refinehint">📍 {t.posApprox}</p>
            <PinDropPicker center={{ lat: refine.lat, lng: refine.lng }} t={t} onConfirm={confirmRefine} />
            <button className="pubbtn" style={{ background: 'var(--panel2)', color: 'var(--muted)', boxShadow: 'none' }} onClick={finishPublish}>
              {t.cancel}
            </button>
          </>
        )}
        {(scanState === 'confirm' || scanState === 'publishing') && draft && (
          <>
            {scanImg && <div className="preview" style={{ maxHeight: 120 }}><img src={scanImg} alt="" style={{ maxHeight: 120 }} /></div>}
            {dupNotice && <div className="dupnotice">ℹ️ {t.dupNotice}</div>}
            {/* honeypot — invisible to humans, form-filling bots populate it */}
            <input
              type="text"
              name="website"
              value={draft.website || ''}
              onChange={(e) => setDraft({ ...draft, website: e.target.value })}
              className="hp-field"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <div className="seg kindswitch">
              <button className={!isPlaceDraft ? 'on' : ''} onClick={() => setDraftKind('event')}>{t.switchEvent}</button>
              <button className={isPlaceDraft ? 'on' : ''} onClick={() => setDraftKind('place')}>{t.switchPlace}</button>
            </div>
            <div className="xfield">
              <div className="lab">{t.fTitle} {confChip(conf?.title)}</div>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            {!isPlaceDraft && (
              <>
                <div className="xrow">
                  <div className={`xfield ${conf?.datetime < 0.6 ? 'check' : ''}`}>
                    <div className="lab">{t.fDate} {confChip(conf?.datetime)}</div>
                    <input type="date" value={draft.date_start} onChange={(e) => setDraft({ ...draft, date_start: e.target.value })} />
                  </div>
                  <div className="xfield">
                    <div className="lab">{t.fTime}</div>
                    <input type="time" value={draft.time_start} onChange={(e) => setDraft({ ...draft, time_start: e.target.value })} />
                  </div>
                </div>
                {/* End date/time — optional; only kept when it's on/after the start. */}
                <div className="xrow">
                  <div className="xfield">
                    <div className="lab">{t.fEndDate}</div>
                    <input type="date" value={draft.date_end || ''} min={draft.date_start || undefined} onChange={(e) => setDraft({ ...draft, date_end: e.target.value })} />
                  </div>
                  <div className="xfield">
                    <div className="lab">{t.fEndTime}</div>
                    <input type="time" value={draft.time_end || ''} onChange={(e) => setDraft({ ...draft, time_end: e.target.value })} />
                  </div>
                </div>
              </>
            )}
            <div className={`xfield ${conf?.location < 0.6 ? 'check' : ''}`}>
              <div className="lab">{t.fVenue} {confChip(conf?.location)}</div>
              <input value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} />
            </div>
            {/* Location: two-way-bound address field + main-map picker. Typing/
                picking an address flies the big map; "Adjust on map" collapses
                this form and reverse-geocodes the settled map centre back here. */}
            <div className="xrow">
              <div className="xfield addr-field">
                <div className="lab">{t.fAddress}</div>
                <input
                  value={draft.address}
                  onChange={(e) => onAddressChange(e.target.value)}
                  onFocus={() => setAddrSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setAddrSuggestOpen(false), 150)}
                  autoComplete="off"
                />
                {/* address autocomplete — GET /api/geocode?suggest=1&q=…, debounced
                    300ms / ≥3 chars; picking a row also flies the main map. */}
                {addrSuggestOpen && addrSuggestions.length > 0 && (
                  <div className="addr-suggest" role="listbox" aria-label={t.fAddressSuggest}>
                    {addrSuggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="addr-suggest-row"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickAddressSuggestion(s)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="xfield">
                <div className="lab">{t.fTown}</div>
                <input value={draft.town} onChange={(e) => setDraft({ ...draft, town: e.target.value })} />
              </div>
            </div>
            <button type="button" className="mapadjust-btn" onClick={enterMapPick}>
              🗺️ {t.adjustOnMap}{draft.lat != null ? ` · ${t.positionSet}` : ''}
            </button>
            <div className="xfield">
              <div className="lab">{t.categories}</div>
              <div className="catgrid">
                {(isPlaceDraft ? PLACE_CATS : EVENT_CATS).map((key) => (
                  <button
                    key={key}
                    className={`cat ${draft.categories.includes(key) ? 'on' : ''}`}
                    style={{ '--cc': CATS[key].color }}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        categories: draft.categories.includes(key) ? draft.categories.filter((x) => x !== key) : [...draft.categories, key],
                      })
                    }
                  >
                    <CatIcon cat={key} size={13} /> {t.cats[key]}
                  </button>
                ))}
              </div>
            </div>
            <div className="xfield">
              <div className="lab">{t.fDesc}</div>
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} />
            </div>
            {isPlaceDraft && (
              <div className="xfield">
                <div className="lab">{t.openingHours}</div>
                <button type="button" className={`chip ${draft.always_open ? 'on' : ''}`} onClick={() => setDraft({ ...draft, always_open: !draft.always_open })}>
                  {t.alwaysOpen}
                </button>
                {!draft.always_open && (
                  <div className="hoursform">
                    {DOW_ORDER.map((k, i) => (
                      <div key={k} className="hoursformrow">
                        <span>{t.weekdaysLong[i].slice(0, 2)}</span>
                        <input
                          type="time"
                          value={draft.hours[k]?.[0] || ''}
                          onChange={(e) => setDraft((d) => ({ ...d, hours: { ...d.hours, [k]: [e.target.value, d.hours[k]?.[1] || ''] } }))}
                        />
                        <span>–</span>
                        <input
                          type="time"
                          value={draft.hours[k]?.[1] || ''}
                          onChange={(e) => setDraft((d) => ({ ...d, hours: { ...d.hours, [k]: [d.hours[k]?.[0] || '', e.target.value] } }))}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <input
                  className="seasonalinput"
                  value={draft.seasonal}
                  placeholder={t.fSeasonalPlaceholder}
                  onChange={(e) => setDraft({ ...draft, seasonal: e.target.value })}
                />
              </div>
            )}
            <button type="button" className={`chip ${draft.is_free ? 'on' : ''}`} onClick={() => setDraft({ ...draft, is_free: !draft.is_free })} style={{ alignSelf: 'flex-start' }}>
              {t.freeEntry}
            </button>
            <button className="pubbtn" disabled={scanState === 'publishing'} onClick={publish}>
              {scanState === 'publishing' ? t.publishing : t.publish}
            </button>
          </>
        )}
      </div>
    </section>
  );

  /* ---------------- render ---------------- */
  // Counts line: pins mode shows the filtered loaded rows (as before); cells
  // mode has no per-row data client-side, so it falls back to the server's
  // unfiltered-by-list total for the current viewport.
  const resultsCountLine = mode === 'cells' ? t.resultsCount.replace('{n}', viewTotal) : `${filtered.length} ${t.events}`;
  // Truncation is user-visible (review finding #2): over a dense city the 800-row
  // cap means the map shows only the soonest events — say so instead of letting
  // "800 events" read as "all events".
  const truncatedNote = mode !== 'cells' && viewTruncated
    ? t.truncatedHint.replace('{n}', events?.length ?? 0).replace('{total}', viewTotal)
    : null;

  const limitCopy = limitNotice ? (() => {
    const action = limitNotice.action === 'ai_intake' ? t.limitAiAction : t.limitPublishAction;
    const reached = limitNotice.scope === 'service'
      ? t.limitUnavailable
      : limitNotice.window === 'day' ? t.limitReachedDay : t.limitReachedHour;
    return {
      action,
      reached: limitNotice.max == null ? reached : reached.replace('{count}', limitNotice.max),
      retry: limitNotice.window === 'hour' ? t.limitRetryHour : t.limitRetryDay,
      why: limitNotice.action === 'ai_intake' ? t.limitWhyAi : t.limitWhyPublish,
    };
  })() : null;

  return (
    <div className="shell">
      {/* ===== desktop sidebar ===== */}
      <aside className="sidebar desktoponly">
        {selected && isDesktop ? (
          <div className="detail-side">{eventDetail(selected, { onBack: () => selectEvent(null, { fly: false }) })}</div>
        ) : (
          <>
            <div className="sidehead">
              {locSearchBar(false)}
            </div>
            <div className="chiprow" style={{ padding: '0 18px 6px' }}>{kindToggle}</div>
            <div className="chiprow" style={{ padding: '0 18px 10px', flexWrap: 'wrap', overflowX: 'visible', rowGap: 7 }}>{dateChips}</div>
            <div className="chiprow" style={{ padding: '0 18px 12px', flexWrap: 'wrap', overflowX: 'visible', rowGap: 7 }}>
              <button className={`chip ${showFilters || advancedFilterCount > 0 ? 'on' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                ⚙︎ {t.filters} {advancedFilterCount > 0 && <span className="badge">{advancedFilterCount}</span>}
              </button>
              {quickFilters}
            </div>
            <div className="locstats" style={{ padding: '0 18px 10px', fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
              {mode === 'cells' ? (
                resultsCountLine
              ) : (
                <><strong style={{ color: 'var(--ink)' }}>{filteredEvents.length}</strong> {t.events} · <strong style={{ color: 'var(--ink)' }}>{filteredPlaces.length}</strong> {t.places}</>
              )}
              {truncatedNote && <div style={{ marginTop: 2, fontWeight: 500 }}>{truncatedNote}</div>}
            </div>
            <div className="sidebody">
              {showFilters && filterPanel}
              {eventList((ev) => selectEvent(ev))}
            </div>
          </>
        )}
      </aside>

      {/* ===== map ===== */}
      <div className="mapwrap">
        <div id="map" ref={mapRef} />
        {!events && (
          <div className="loading" role="status" aria-label={t.loading}>
            <svg className="okolo-mark" viewBox="0 0 380 120" aria-hidden="true">
              <circle cx="52" cy="70" r="30" fill="none" stroke="currentColor" strokeWidth="11" />
              <path d="M104 22 V100 M104 71 L141 42 M104 71 L141 100" fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="188" cy="70" r="30" fill="none" stroke="currentColor" strokeWidth="11" />
              <path className="okolo-pinpath" transform="translate(213.6 18.6) scale(3.7)" fillRule="evenodd" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
              <circle cx="328" cy="70" r="30" fill="none" stroke="currentColor" strokeWidth="11" />
            </svg>
            <div className="okolo-loadbar" aria-hidden="true" />
          </div>
        )}

        {/* mobile top bar — Google-Maps-style search pill + menu button (menu content lives in locSearchBar) */}
        <div className="m-topbar mobileonly">
          {locSearchBar(true)}
          {/* quick preview — sits right under the search bar: full title, time, short description */}
          {selected && !isDesktop && !detailFull && (
            <div className="minicard" style={{ '--cc': CATS[primaryCat(selected)].color }} onClick={() => setDetailFull(true)}>
              <span className="thumb"><CatIcon cat={primaryCat(selected)} size={19} /></span>
              <span className="tx">
                <span className="t">{selected.title}</span>
                <span className="w">{selected.kind === 'place' ? placeStatusLabel(selected, t) : fmtWhenShort(selected, lang, t)}</span>
                <span className="m">{[selected.venue, selected.town].filter(Boolean).join(', ')} · {distKm(refPoint, selected).toFixed(1).replace('.', ',')} km</span>
                {selected.description && <span className="d">{selected.description}</span>}
              </span>
              <button className="morebtn" onClick={(e) => { e.stopPropagation(); setDetailFull(true); }} aria-label={t.learnMore}><CaretRight size={18} weight="bold" /></button>
              <button className="xbtn" onClick={(e) => { e.stopPropagation(); selectEvent(null, { fly: false }); }} aria-label={t.close}><X size={14} weight="bold" /></button>
            </div>
          )}
        </div>

        <details className="map-legend">
          <summary>{t.legend}</summary>
          <div className="map-legend-body">
            <span><i className="legend-pin event" />{t.legendEvent}</span>
            <span><i className="legend-pin place" />{t.legendPlace}</span>
            <span><i className="legend-pin event community" />{t.legendCommunity}</span>
            <span><i className="legend-pin event count" />{t.moreAtVenue}</span>
            <span><i className="legend-town-group">5</i>{t.legendTownGroup}</span>
            <span><i className="legend-cluster">12</i>{t.legendCluster}</span>
          </div>
        </details>

        {/* mobile bottom chip bar — filters stay visible even with a preview open */}
        {sheet === 'closed' && !detailFull && (
          <div className="m-bottombar mobileonly">
            <div className="chiprow" style={{ paddingBottom: 4 }}>{kindToggle}</div>
            <div className="chiprow" style={{ paddingBottom: 4 }}>{dateChips}</div>
            <div className="chiprow">
              {quickFilters}
              <button className={`chip ${advancedFilterCount > 0 ? 'on' : ''}`} aria-label={t.filters} onClick={() => { setSheetContent('filters'); setSheet('half'); }}>
                ⚙︎ {advancedFilterCount > 0 && <span className="badge">{advancedFilterCount}</span>}
              </button>
              <button className="chip" onClick={() => { setSheetContent('list'); setSheet('full'); }}>
                ☰ {mode === 'cells' ? viewTotal : filtered.length}
              </button>
            </div>
          </div>
        )}

        {/* mobile sheet (filters / list) */}
        <section className={`m-sheet mobileonly ${sheet !== 'closed' ? sheet : ''}`}>
          <button className="grabber" onClick={() => setSheet(sheet === 'full' ? 'half' : 'full')} aria-label={t.resizePanel}><i /></button>
          <div className="m-sheethead">
            <b>{sheetContent === 'filters' ? t.filters : resultsCountLine}</b>
            <button className="m-close" onClick={() => setSheet('closed')} aria-label={t.close}><X size={14} weight="bold" /></button>
          </div>
          {sheetContent === 'list' && truncatedNote && (
            <div style={{ padding: '0 16px 6px', fontSize: 11.5, color: 'var(--muted)', fontWeight: 500 }}>{truncatedNote}</div>
          )}
          <div className="m-sheetbody">
            {sheetContent === 'filters' ? (
              <>
                <div className="chiprow">{kindToggle}</div>
                <div className="chiprow">{dateChips}</div>
                <div className="chiprow">{quickFilters}</div>
                {filterPanel}
              </>
            ) : (
              eventList((ev) => { setSheet('closed'); selectEvent(ev); })
            )}
          </div>
        </section>

        {/* full-screen detail (mobile) */}
        {selected && !isDesktop && detailFull && (
          <div className="detail-full">{eventDetail(selected, { onBack: () => setDetailFull(false), onClose: () => selectEvent(null, { fly: false }) })}</div>
        )}

        {/* map-pick: fixed centre crosshair + slim confirm bar over the live map */}
        {mapPick && <div className="map-crosshair" aria-hidden="true">📍</div>}
        {mapPick && (
          <div className="mappick-bar">
            <button className="mappick-cancel" onClick={cancelMapPick} aria-label={t.cancel}><X size={16} weight="bold" /></button>
            <span className="mappick-hint">{t.mapPickHint}</span>
            <button className="mappick-confirm" onClick={confirmMapPick}>✓ {t.confirmPosition}</button>
          </div>
        )}

        {/* floating controls — one reflowing column above the filter bar: Add FAB
            at the bottom (primary, DOM-first → column-reverse), locate above it.
            The whole stack hides where it would overlap a sheet / full detail. */}
        <div className={`floatstack ${capture || (!isDesktop && (sheet !== 'closed' || detailFull)) ? 'hidden' : ''}`}>
          <button className="fab" onClick={openCapture} aria-label={t.addToMap}>
            +
          </button>
          <button
            className={`locate-btn ${locating ? 'locating' : ''} ${locating || (located && !searchCenter) ? 'active' : ''}`}
            onClick={locateMe}
            aria-label={t.locateMe}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <circle cx="12" cy="12" r="7" />
            </svg>
          </button>
        </div>
      </div>

      {/* date range picker modal */}
      {dpOpen && (
        <div className="dp-modal-scrim" onClick={() => setDpOpen(false)}>
          <DateRangePicker
            lang={lang}
            t={t}
            from={dpDraft.from}
            to={dpDraft.to}
            onChange={(from, to) => setDpDraft({ from, to })}
            onDone={() => {
              setRange(dpDraft);
              setWhenMode('range');
              setDpOpen(false);
            }}
          />
        </div>
      )}

      {nl.open && (
        <div className="nl-scrim" onClick={() => setNl((s) => ({ ...s, open: false }))}>
          <div className="nl-modal nl-preferences-modal" role="dialog" aria-modal="true" aria-labelledby="newsletter-title" onClick={(e) => e.stopPropagation()}>
            <button className="nl-close" onClick={() => setNl((s) => ({ ...s, open: false }))} aria-label={t.close}><X size={16} weight="bold" /></button>
            <div className="nl-icon">✉️</div>
            <h3 id="newsletter-title">{t.nlTitle}</h3>
            {nl.done ? (
              <p className="nl-done">{nl.pending ? t.nlConfirmSent : t.nlThanks}</p>
            ) : (
              <>
                <p className="nl-blurb">{t.nlBlurb}</p>
                <form onSubmit={submitNewsletter}>
                  <label className="nl-field">
                    <span>{t.nlEmail}</span>
                    <input
                      type="email"
                      className="nl-input"
                      value={nl.email}
                      onChange={(e) => setNl((s) => ({ ...s, email: e.target.value }))}
                      placeholder={t.nlPlaceholder}
                      autoFocus
                      required
                    />
                  </label>
                  <label className="nl-field">
                    <span>{t.nlArea}</span>
                    <input
                      type="text"
                      className="nl-input"
                      value={nl.area}
                      onChange={(e) => changeNewsletterArea(e.target.value)}
                      placeholder={t.nlAreaPlaceholder}
                      list="newsletter-towns"
                      autoComplete="postal-code"
                      required
                    />
                    <datalist id="newsletter-towns">
                      {[...townCenters.keys()]
                        .sort((a, b) => a.localeCompare(b, locale(lang)))
                        .map((town) => <option key={town} value={town} />)}
                    </datalist>
                    <small>{t.nlAreaHelp}</small>
                  </label>
                  {/* The interests picker is GONE (George, 2026-07-14: "keep it
                      simple"). It asked people to choose categories and then the
                      send ignored them — a promise we weren't keeping. The digest
                      is one list per city; the signal for what people actually
                      want comes from filter taps and Interested taps, which every
                      visitor gives us for free, not just the ones who subscribe.
                      Fewer fields also converts better, which matters more at 0
                      subscribers than personalisation does. The `categories`
                      column stays — nothing is lost if we bring this back. */}
                  <button type="submit" className="nl-submit" disabled={nl.busy}>{nl.busy ? t.nlSending : t.nlSubmit}</button>
                </form>
                {nl.err && <p className="nl-err">{nl.err}</p>}
                <p className="nl-fine">{t.nlConsent} <a href="/datenschutz" target="_blank" rel="noreferrer">{t.privacyLink}</a></p>
              </>
            )}
          </div>
        </div>
      )}

      {savedOpen && (
        <div className="nl-scrim" onClick={() => setSavedOpen(false)}>
          <div className="nl-modal saved-modal" role="dialog" aria-modal="true" aria-labelledby="saved-title" onClick={(e) => e.stopPropagation()}>
            <button className="nl-close" onClick={() => setSavedOpen(false)} aria-label={t.close}><X size={16} weight="bold" /></button>
            <div className="nl-icon">🔖</div>
            <h3 id="saved-title">{t.savedTitle}</h3>
            {savedItems.length === 0 ? (
              <p className="nl-blurb">{t.savedEmpty}</p>
            ) : (
              <div className="saved-list">
                {savedItems.map((s) => {
                  const sCat = primaryCat(s);
                  return (
                    <button
                      key={s.id}
                      className="dvenue-row"
                      style={{ '--cc': CATS[sCat].color }}
                      onClick={() => { setSavedOpen(false); selectEvent(s); }}
                    >
                      <span className="thumb"><CatIcon cat={sCat} size={15} /></span>
                      <span className="tx">
                        <span className="t">{s.title}</span>
                        <span className="m">
                          {s.kind === 'place'
                            ? [s.venue, s.town].filter(Boolean).join(', ')
                            : fmtWhenShort(s, lang, t)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="nl-fine">{t.savedFine}</p>
          </div>
        </div>
      )}

      {advertiseOpen && (
        <div className="nl-scrim" onClick={() => setAdvertiseOpen(false)}>
          <div className="nl-modal advertise-modal" role="dialog" aria-modal="true" aria-labelledby="advertise-title" onClick={(e) => e.stopPropagation()}>
            <button className="nl-close" onClick={() => setAdvertiseOpen(false)} aria-label={t.close}><X size={16} weight="bold" /></button>
            <div className="nl-icon">📣</div>
            <h3 id="advertise-title">{t.adTitle}</h3>
            <p className="nl-blurb">{t.adBlurb}</p>
            <div className="ad-benefits">
              <p><span aria-hidden="true">✦</span>{t.adBenefitVisual}</p>
              <p><span aria-hidden="true">↑</span>{t.adBenefitRanking}</p>
            </div>
            <p className="ad-disclosure">{t.adDisclosure}</p>
            <a className="nl-submit ad-contact" href={`mailto:hello@okolo.events?subject=${encodeURIComponent(t.adEmailSubject)}`}>{t.adContact}</a>
            <p className="nl-fine">{t.adPartnerships}</p>
          </div>
        </div>
      )}

      {limitNotice && limitCopy && (
        <div className="limit-scrim" onClick={() => setLimitNotice(null)}>
          <div className="limit-modal" role="dialog" aria-modal="true" aria-labelledby="limit-title" onClick={(e) => e.stopPropagation()}>
            <button className="limit-close" onClick={() => setLimitNotice(null)} aria-label={t.close}><X size={17} weight="bold" /></button>
            <div className="limit-icon" aria-hidden="true">⏳</div>
            <h3 id="limit-title">{t.limitTitle}</h3>
            <p className="limit-lead">{limitCopy.reached} {limitCopy.retry}</p>

            <section className="limit-section">
              <h4>{t.limitWhyTitle}</h4>
              <p>{limitCopy.why}</p>
            </section>

            <section className="limit-section">
              <h4>{t.limitAllowanceTitle.replace('{action}', limitCopy.action)}</h4>
              <ul className="limit-list">
                <li>{t.limitHourly.replace('{count}', limitNotice.perHour)}</li>
                <li>{t.limitDaily.replace('{count}', limitNotice.perDay)}</li>
              </ul>
            </section>

            <p className="limit-privacy">{t.limitPrivacy}</p>
            <p className="limit-contact">{t.limitContact} <a href="mailto:hello@okolo.events?subject=Okolo%20contribution%20limit">{t.limitEmail}: hello@okolo.events</a></p>
            <button className="limit-dismiss" autoFocus onClick={() => setLimitNotice(null)}>{t.limitDismiss}</button>
          </div>
        </div>
      )}

      {captureView}
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
