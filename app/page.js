'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowLeft, X, List, MagnifyingGlass, NavigationArrow, CalendarPlus, ShareNetwork, Camera, LinkSimple, PencilSimple, CaretRight } from '@phosphor-icons/react';
import { CATS, CatIcon, catIconSvg, EVENT_CATS, PLACE_CATS } from '../lib/icons.js';
import { LANGS, LANGUAGE_NAMES } from '../lib/i18n.js';
import { TOWNS, townCentroid } from '../lib/towns.js';
import { groupEventSeries } from '../lib/map-groups.js';
import { track } from '../lib/analytics.js';
import { useLanguage } from './language-provider.js';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const HOME = { lat: 48.3, lng: 14.29 }; // Linz fallback
const DETAIL_MARKER_ZOOM = 12.5;
const OVERVIEW_MARKER_MAX_ZOOM = DETAIL_MARKER_ZOOM;

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
  s += ` · ${ev.starts_at.slice(11, 16)}`;
  if (ev.ends_at && endDay === startDay) s += `–${ev.ends_at.slice(11, 16)}`;
  return s;
}
function fmtWhenShort(ev, lang, t) {
  const d = fmtDay(ev.starts_at.slice(0, 10), lang, t);
  return ev.all_day ? `${d} · ${t.allDay}` : `${d} · ${ev.starts_at.slice(11, 16)}`;
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
function circleGeoJSON(center, km) {
  const pts = [];
  const latR = km / 110.574, lngR = km / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([center.lng + lngR * Math.cos(a), center.lat + latR * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] } };
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
  if (ev.all_day) {
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
  const markers = useRef(new Map());
  const fileInput = useRef(null);

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
  // address) from the search dropdown. Distance labels + the radius filter recompute
  // around it instead of `me`; null restores the user's own position as reference.
  const [searchCenter, setSearchCenter] = useState(null); // {lat,lng,label} | null
  const refPoint = searchCenter || me;

  // top-right actions menu + search
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [orteMatches, setOrteMatches] = useState([]); // instant local town matches
  const [geoResult, setGeoResult] = useState(null); // remote forward-geocode result {lat,lng,label} | null
  const [geoLoading, setGeoLoading] = useState(false);
  const geoDebounce = useRef(null);
  const geoReqId = useRef(0);
  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery('');
    setOrteMatches([]);
    setGeoResult(null);
    setGeoLoading(false);
    clearTimeout(geoDebounce.current);
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
      radiusKm: 20,
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

  function toggleNewsletterCategory(category) {
    setNl((s) => {
      const selectedCategory = s.categories.includes(category);
      if (!selectedCategory && s.categories.length >= 3) return s;
      return {
        ...s,
        categories: selectedCategory
          ? s.categories.filter((c) => c !== category)
          : [...s.categories, category],
      };
    });
  }

  async function runForwardGeocode(q) {
    const reqId = ++geoReqId.current;
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (reqId === geoReqId.current) setGeoResult(data.result || null);
    } catch {
      if (reqId === geoReqId.current) setGeoResult(null);
    } finally {
      if (reqId === geoReqId.current) setGeoLoading(false);
    }
  }

  // instant client-side town match as the user types; falls back to a debounced
  // (600ms, ≥3 chars) forward-geocode via the Nominatim-backed API when nothing
  // local matches.
  useEffect(() => {
    const q = searchQuery.trim();
    clearTimeout(geoDebounce.current);
    if (q.length < 2) { setOrteMatches([]); setGeoResult(null); setGeoLoading(false); return; }
    const ql = q.toLowerCase();
    const local = [...townCenters.entries()]
      .filter(([name]) => name.toLowerCase().includes(ql))
      .slice(0, 5)
      .map(([label, c]) => ({ label, lat: c.lat, lng: c.lng }));
    setOrteMatches(local);
    setGeoResult(null);
    if (local.length === 0 && q.length >= 3) {
      geoDebounce.current = setTimeout(() => runForwardGeocode(q), 600);
    } else {
      setGeoLoading(false);
    }
    return () => clearTimeout(geoDebounce.current);
  }, [searchQuery, townCenters]); // eslint-disable-line react-hooks/exhaustive-deps

  // selecting a location result: fly there, drop a temporary marker, and make
  // it the reference point for distances/radius.
  function selectLocation(loc) {
    closeSearch();
    setSearchCenter({ lat: loc.lat, lng: loc.lng, label: loc.label });
    mapObj.current?.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(mapObj.current.getZoom(), 12), duration: 800 });
  }
  function clearSearchCenter() {
    setSearchCenter(null);
    mapObj.current?.flyTo({ center: [me.lng, me.lat], zoom: Math.max(mapObj.current.getZoom(), 12), duration: 700 });
  }

  // filters
  const [kindFilter, setKindFilter] = useState('all'); // all | event | place
  const [whenMode, setWhenMode] = useState('weekend'); // all | today | tomorrow | weekend | next7 | range
  const [range, setRange] = useState({ from: null, to: null });
  const [dpOpen, setDpOpen] = useState(false);
  const [dpDraft, setDpDraft] = useState({ from: null, to: null });
  const [radius, setRadius] = useState(20);
  const deferredRadius = useDeferredValue(radius);
  const [cats, setCats] = useState([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [kidsOnly, setKidsOnly] = useState(false);
  const [inOut, setInOut] = useState('any'); // any | in | out
  const [tod, setTod] = useState([]); // morning | afternoon | evening

  // ui state
  const [showFilters, setShowFilters] = useState(false);
  const [sheet, setSheet] = useState('closed'); // mobile: closed | half | full
  const [sheetContent, setSheetContent] = useState('list'); // list | filters
  const [selected, setSelected] = useState(null);
  const [detailFull, setDetailFull] = useState(false);
  const [calMenu, setCalMenu] = useState(false); // event id whose "add to calendar" menu is open
  const [nl, setNl] = useState({
    open: false, email: '', area: '', areaLat: null, areaLng: null,
    radiusKm: 20, categories: [], busy: false, done: false, err: '',
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
  const reverseDebounce = useRef(null);

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
        const country = lang === 'bg' ? 'BG' : 'AT';
        const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(area)}&country=${country}`);
        const geoData = await geoRes.json();
        location = geoRes.ok ? geoData.result : null;
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
          radiusKm: nl.radiusKm,
          categories: nl.categories,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.requestFailed);
      track('newsletter_signup');
      setNl((s) => ({ ...s, busy: false, done: true }));
    } catch (err) {
      setNl((s) => ({ ...s, busy: false, err: String(err.message || err) }));
    }
  }

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 2800);
  }

  async function loadEvents() {
    const res = await fetch('/api/events?view=map');
    const data = await res.json();
    setEvents(data.events);
    return data.events;
  }
  useEffect(() => { loadEvents(); }, []);

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
      mapObj.current?.flyTo({ center: [me.lng, me.lat], zoom: Math.max(mapObj.current.getZoom(), 13), duration: 800 });
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(loc);
        setLocated(true);
        setSearchCenter(null);
        setLocating(false);
        mapObj.current?.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(mapObj.current.getZoom(), 13), duration: 800 });
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
  const [detailMarkersVisible, setDetailMarkersVisible] = useState(false);
  const [detailMarkerBounds, setDetailMarkerBounds] = useState(null);
  const geoRef = useRef({ me: HOME, radius: 20 });
  geoRef.current = { me: refPoint, radius };
  const selectRef = useRef(() => {});

  function syncDetailMarkerViewport(map) {
    const showDetailMarkers = map.getZoom() >= DETAIL_MARKER_ZOOM;
    setDetailMarkersVisible((current) => current === showDetailMarkers ? current : showDetailMarkers);
    if (!showDetailMarkers) {
      setDetailMarkerBounds((current) => current == null ? current : null);
      return;
    }
    const bounds = map.getBounds();
    const lngPad = (bounds.getEast() - bounds.getWest()) * 0.2;
    const latPad = (bounds.getNorth() - bounds.getSouth()) * 0.2;
    const next = [
      bounds.getWest() - lngPad,
      bounds.getSouth() - latPad,
      bounds.getEast() + lngPad,
      bounds.getNorth() + latPad,
    ];
    setDetailMarkerBounds((current) => (
      current?.every((value, i) => Math.abs(value - next[i]) < 0.00001) ? current : next
    ));
  }

  useEffect(() => {
    if (mapObj.current || !mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE,
      center: [HOME.lng, HOME.lat],
      zoom: 10.6,
      locale: mapLibreLocale(t),
      // OSM-mined place *data* requires its own ODbL credit beyond the tile attribution.
      attributionControl: {
        compact: true,
        customAttribution: `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">${t.mapAttribution}</a>`,
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('radius', { type: 'geojson', data: circleGeoJSON(geoRef.current.me, geoRef.current.radius) });
      map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#C93A5B', 'fill-opacity': 0.035 } });
      map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#C93A5B', 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [3, 3] } });
    });
    map.on('moveend', () => syncDetailMarkerViewport(map));
    map.on('click', () => { selectRef.current(null, { fly: false }); setMenuOpen(false); });
    const meEl = document.createElement('div');
    meEl.className = 'me-marker hidden';
    meMarker.current = new maplibregl.Marker({ element: meEl }).setLngLat([HOME.lng, HOME.lat]).addTo(map);
    map.on('error', (e) => console.error('[maplibre]', e?.error?.message || e));
    if (typeof window !== 'undefined') window.__umkreisMap = map;
    mapObj.current = map;
    syncDetailMarkerViewport(map);
    return () => {
      map.remove();
      mapObj.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    meMarker.current?.setLngLat([me.lng, me.lat]);
  }, [me]);

  // radius circle recomputes around the search center when one is set, the
  // user's own position otherwise (task: also drives the PLACES distance filter).
  useEffect(() => {
    const src = mapObj.current?.getSource('radius');
    if (src) src.setData(circleGeoJSON(refPoint, radius));
  }, [refPoint.lat, refPoint.lng, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    meMarker.current?.getElement().classList.toggle('hidden', !located);
  }, [located]);

  // temporary marker at the search-anywhere reference point.
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (searchMarker.current) { searchMarker.current.remove(); searchMarker.current = null; }
    if (searchCenter) {
      const el = document.createElement('div');
      el.className = 'search-marker';
      searchMarker.current = new maplibregl.Marker({ element: el }).setLngLat([searchCenter.lng, searchCenter.lat]).addTo(map);
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
        try {
          const res = await fetch(`/api/geocode?reverse=1&lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}`);
          const data = await res.json();
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
      let groupedMarker = null;
      for (const rec of markers.current.values()) {
        const selectedHere = (rec.ev._venueIds || [rec.ev.id]).includes(ev.id);
        rec.el.classList.toggle('selected', selectedHere);
        if (selectedHere) groupedMarker = rec;
      }
      if (fly && mapObj.current) {
        mapObj.current.flyTo({
          center: [groupedMarker?.ev.lng ?? ev.lng, groupedMarker?.ev.lat ?? ev.lat],
          zoom: Math.max(mapObj.current.getZoom(), 12.5),
          padding: isDesktop ? { left: 0 } : { top: 200, bottom: 150 },
          duration: 700,
        });
      }
    } else {
      for (const rec of markers.current.values()) rec.el.classList.remove('selected');
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

  // Common filters (radius, category, free, kids, indoor/outdoor, search) apply to
  // both kinds. Date chips and time-of-day only make sense for events — places are
  // evergreen and must never be hidden by them (design doc rule).
  const commonFiltered = useMemo(() => {
    if (!events) return [];
    return events.filter((ev) => {
      if (distKm(refPoint, ev) > deferredRadius) return false;
      if (cats.length && !ev.categories.some((c) => cats.includes(c))) return false;
      if (freeOnly && ev.is_free !== 1) return false;
      if (kidsOnly && !(ev.age_min != null || ev.categories.includes('family'))) return false;
      if (inOut === 'in' && ev.indoor !== 1) return false;
      if (inOut === 'out' && ev.indoor !== 0) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const catLabels = (ev.categories || []).map((c) => t.cats[c] || c).join(' ');
        const hay = `${ev.title} ${ev.venue || ''} ${ev.town || ''} ${catLabels}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, deferredRadius, cats, freeOnly, kidsOnly, inOut, refPoint, searchQuery, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEvents = useMemo(() => {
    if (kindFilter === 'place') return [];
    return commonFiltered
      .filter((ev) => ev.kind !== 'place')
      .filter((ev) => {
        const d = ev.starts_at.slice(0, 10);
        const dEnd = (ev.ends_at || ev.starts_at).slice(0, 10);
        if (dEnd < dFrom || d > dTo) return false;
        if (tod.length && !ev.all_day) {
          const h = +ev.starts_at.slice(11, 13);
          const bucket = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
          if (!tod.includes(bucket)) return false;
        }
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

  // Rich DOM markers are useful only at neighborhood zoom. Build them solely
  // from matching rows, so initial regional views do not allocate thousands of
  // hidden elements and a venue badge never includes filtered-out events.
  const markerItems = useMemo(() => {
    if (!detailMarkersVisible || !detailMarkerBounds) return [];
    const [west, south, east, north] = detailMarkerBounds;
    return groupedMapItems.filter((ev) => ev.lng >= west && ev.lng <= east && ev.lat >= south && ev.lat <= north);
  }, [detailMarkersVisible, detailMarkerBounds, groupedMapItems]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const ids = new Set(markerItems.map((ev) => ev.id));
    for (const [id, rec] of markers.current) {
      if (!ids.has(id)) {
        rec.marker.remove();
        markers.current.delete(id);
      }
    }
    for (const ev of markerItems) {
      const cat = primaryCat(ev);
      const color = CATS[cat].color;
      const community = isCommunitySubmitted(ev);
      const selectedHere = selected && (ev._venueIds || [ev.id]).includes(selected.id);
      const pinClass = 'pin2' + (ev.geo_precision === 'town' ? ' approx-precision' : '') + (ev.kind === 'place' ? ' pin-place' : '') + (community ? ' pin-user' : '') + (ev._seriesCount > 1 ? ' pin-series' : '') + (selectedHere ? ' selected' : '');
      const badgeHtml = ev._venueCount > 1 ? `<span class="pin-badge">${ev._venueCount}</span>` : '';
      const markerHtml = catIconSvg(cat, 15) + badgeHtml;
      const ariaBits = [ev.kind === 'place' ? t.legendPlace : t.legendEvent, ev.title];
      if (community) ariaBits.push(t.legendCommunity);
      if (ev.geo_precision === 'town') ariaBits.push(t.markerApprox);
      if (ev._seriesCount > 1) ariaBits.push(t.markerSeriesCount.replace('{count}', ev._seriesCount));
      if (ev._venueCount > 1) ariaBits.push(t.markerVenueCount.replace('{count}', ev._venueCount));
      const ariaLabel = ariaBits.join(', ');
      const existing = markers.current.get(ev.id);
      if (existing) {
        if (existing.el.style.getPropertyValue('--cc') !== color) existing.el.style.setProperty('--cc', color);
        if (existing.el.innerHTML !== markerHtml) existing.el.innerHTML = markerHtml;
        if (existing.el.className !== pinClass) existing.el.className = pinClass;
        if (existing.el.getAttribute('aria-label') !== ariaLabel) existing.el.setAttribute('aria-label', ariaLabel);
        if (existing.ev.lat !== ev.lat || existing.ev.lng !== ev.lng) existing.marker.setLngLat([ev.lng, ev.lat]);
        existing.ev = ev;
        continue;
      }
      const el = document.createElement('div');
      el.className = pinClass;
      el.style.setProperty('--cc', color);
      el.innerHTML = markerHtml;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', ariaLabel);
      el.tabIndex = 0;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectRef.current(markers.current.get(ev.id)?.ev || ev);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        selectRef.current(markers.current.get(ev.id)?.ev || ev);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([ev.lng, ev.lat]).addTo(map);
      markers.current.set(ev.id, { marker, el, ev });
    }
  }, [markerItems, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    for (const { el, ev } of markers.current.values()) {
      el.classList.toggle('selected', Boolean(selected && (ev._venueIds || [ev.id]).includes(selected.id)));
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Regional zoom uses MapLibre's native spatial clustering so hundreds of
  // results remain scannable. At neighborhood zoom the richer DOM markers take
  // over (category icon/color, event/place shape, provenance, precision, venue count).
  const clusterData = useMemo(() => {
    const features = groupedMapItems.map((ev) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
        properties: { color: CATS[primaryCat(ev)].color },
      }));
    return { type: 'FeatureCollection', features };
  }, [groupedMapItems]);
  const clusterDataRef = useRef(clusterData);
  clusterDataRef.current = clusterData;

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const install = () => {
      const existing = map.getSource('result-clusters');
      if (existing) {
        existing.setData(clusterDataRef.current);
        return;
      }
      map.addSource('result-clusters', {
        type: 'geojson', data: clusterDataRef.current, cluster: true, clusterMaxZoom: 12, clusterRadius: 48,
      });
      map.addLayer({
        id: 'result-cluster-bubbles', type: 'circle', source: 'result-clusters', maxzoom: OVERVIEW_MARKER_MAX_ZOOM,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#26332f', 'circle-opacity': 0.93,
          'circle-radius': ['step', ['get', 'point_count'], 17, 25, 21, 100, 26],
          'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'result-cluster-counts', type: 'symbol', source: 'result-clusters', maxzoom: OVERVIEW_MARKER_MAX_ZOOM,
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Bold'] },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'result-overview-points', type: 'circle', source: 'result-clusters', maxzoom: OVERVIEW_MARKER_MAX_ZOOM,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'], 'circle-radius': 8.5, 'circle-opacity': 0.94,
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        },
      });
      const zoomToFeature = (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        map.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(13, map.getZoom() + 2) });
      };
      map.on('click', 'result-cluster-bubbles', zoomToFeature);
      map.on('click', 'result-overview-points', zoomToFeature);
      for (const layer of ['result-cluster-bubbles', 'result-overview-points']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
    };
    if (map.isStyleLoaded()) install();
    else map.once('load', install);
    return () => map.off('load', install);
  }, [clusterData]);

  useEffect(() => {
    const visible = new Set(filtered.map((e) => e.id));
    if (selected && !visible.has(selected.id)) selectEvent(null, { fly: false });
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const advancedFilterCount = (radius !== 20 ? 1 : 0) + cats.length + (inOut === 'out' ? 1 : 0) + tod.length;
  const activeFilterCount = advancedFilterCount + (freeOnly ? 1 : 0) + (kidsOnly ? 1 : 0) + (inOut === 'in' ? 1 : 0);
  function resetFilters() {
    setRadius(20); setCats([]); setFreeOnly(false); setKidsOnly(false); setInOut('any'); setTod([]);
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
      kind: 'event', title: '', date_start: todayStr(), time_start: '', venue: '', address: '', town: 'Linz', lat: null, lng: null,
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
      if (!res.ok) throw new Error(data.error || t.extractionFailed);
      const x = data.extraction;
      if (!x.is_event) setScanErr(t.noEventDetected);
      setPhotoPath(data.photo_path);
      setDupNotice(data.duplicate || null);
      setDraft({
        kind: 'event',
        title: x.title || '',
        date_start: x.date_start || '',
        time_start: x.time_start || '',
        venue: x.venue || '',
        address: x.address || '',
        town: x.town || 'Linz',
        lat: null, lng: null,
        categories: (x.categories || []).filter((c) => CATS[c]),
        is_free: x.is_free === true,
        description: x.description || '',
        confidence: x.confidence || { title: 0, datetime: 0, location: 0 },
      });
      setScanState('confirm');
    } catch (e) {
      setScanErr(String(e.message || e));
      setScanState('pick');
    }
  }
  // Link pipeline: server-side fetch + JSON-LD/OG/AI cascade (/api/extract-url),
  // then the same confirm screen as a poster scan. A blocked/login-walled/
  // event-less page comes back with fallback:true — we surface the nudge and
  // stay on the intake screen where the camera drop zone is one tap away.
  async function handleUrl(rawUrl) {
    const url = (rawUrl || '').trim();
    if (!url) return;
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
        venue: x.venue || '',
        address: x.address || '',
        town: x.town || 'Linz',
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
    if (c) setDraft((d) => ({ ...d, lat: c.lat, lng: c.lng }));
    // Restore the form immediately; Nominatim may take a few seconds. The
    // resolved label fills in behind it without making Confirm feel stuck.
    setMapPick(false);
    if (!c) return;
    try {
      const res = await fetch(`/api/geocode?reverse=1&lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}`);
      const data = await res.json();
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
    if (!draft.title || (!isPlace && !draft.date_start)) {
      setScanErr(isPlace ? t.requiredErrPlace : t.requiredErr);
      return;
    }
    setScanState('publishing');
    // Known coordinates (from the map pin-drop or a picked address suggestion) are
    // trusted over server-side geocoding whenever we have them, for either kind.
    const coordsPatch = draft.lat != null ? { lat: draft.lat, lng: draft.lng, geo_precision: 'address' } : {};
    const placeHours = buildOpeningHours(draft.hours);
    const body = isPlace
      ? {
          kind: 'place',
          title: draft.title,
          description: draft.description || null,
          venue: draft.venue || null,
          address: draft.address || null,
          town: draft.town || 'Linz',
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
          starts_at: `${draft.date_start}T${/^\d{2}:\d{2}$/.test(draft.time_start) ? draft.time_start : '09:00'}`,
          all_day: !/^\d{2}:\d{2}$/.test(draft.time_start),
          venue: draft.venue || null,
          address: draft.address || null,
          town: draft.town || 'Linz',
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
    const showOrte = orteMatches.length > 0 || geoLoading || geoResult;
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
                  if (e.key === 'Enter') {
                    const q = searchQuery.trim();
                    if (q.length >= 3 && orteMatches.length === 0) {
                      clearTimeout(geoDebounce.current);
                      runForwardGeocode(q);
                    }
                  }
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
                {orteMatches.map((loc) => (
                  <button key={loc.label} className="search-row loc" onClick={() => selectLocation(loc)}>
                    📍 {loc.label}
                  </button>
                ))}
                {orteMatches.length === 0 && geoLoading && <div className="search-loading">{t.searching}</div>}
                {orteMatches.length === 0 && !geoLoading && geoResult && (
                  <button className="search-row loc" onClick={() => selectLocation(geoResult)}>
                    📍 {geoResult.label}
                  </button>
                )}
              </div>
            )}
            <div className="search-section">
              <div className="search-sechead">{t.searchSectionEvents}</div>
              {filtered.slice(0, 6).map((ev) => (
                <button key={ev.id} className="search-row" onClick={() => { closeSearch(); selectEvent(ev); }}>
                  {ev.title}
                  <span>{ev.town || ev.venue}</span>
                </button>
              ))}
              {filtered.length === 0 && <div className="search-empty">{t.emptyTitle}</div>}
            </div>
          </div>
        )}
      </div>
    );
  }

  const kindToggle = (
    <>
      {[['all', t.kindAll], ['event', t.kindEvents], ['place', t.kindPlaces]].map(([k, label]) => (
        <button key={k} className={`chip ${kindFilter === k ? 'on' : ''}`} onClick={() => setKindFilter(k)}>
          {label}
        </button>
      ))}
    </>
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
      <button className={`chip ${inOut === 'in' ? 'on' : ''}`} onClick={() => setInOut(inOut === 'in' ? 'any' : 'in')}>{t.indoor}</button>
      <button className={`chip ${freeOnly ? 'on' : ''}`} onClick={() => setFreeOnly(!freeOnly)}>{t.freeOnly}</button>
    </>
  );

  const filterPanel = (
    <div className="filters">
      <div className="fgroup">
        <h4>{t.radius} <output>{radius} km</output></h4>
        <input type="range" min="3" max="40" step="1" value={radius} onChange={(e) => setRadius(+e.target.value)} aria-label={t.radius} />
      </div>
      <div className="fgroup">
        <h4>{t.place}</h4>
        <div className="seg">
          {[['any', t.inOutAny], ['in', t.indoor], ['out', t.outdoor]].map(([k, label]) => (
            <button key={k} className={inOut === k ? 'on' : ''} onClick={() => setInOut(k)}>{label}</button>
          ))}
        </div>
      </div>
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
          {(kindFilter === 'event' ? EVENT_CATS : kindFilter === 'place' ? PLACE_CATS : [...EVENT_CATS, ...PLACE_CATS]).map((key) => (
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
        </div>
      </div>
      {activeFilterCount > 0 && <button className="resetbtn" onClick={resetFilters}>{t.reset}</button>}
    </div>
  );

  function eventList(onPick) {
    let lastDay = null;
    if (filteredEvents.length === 0 && filteredPlaces.length === 0) {
      return (
        <div className="empty">
          {t.emptyTitle}
          <br />
          <button onClick={() => setRadius(Math.min(40, radius + 10))}>{t.widenRadius}</button>
          <br />
          <span>{t.knowOne} 📷</span>
        </div>
      );
    }
    return (
      <div className="list">
        {filteredEvents.map((ev) => {
          const d = ev.starts_at.slice(0, 10);
          const groupDay = d < dFrom ? 'ongoing' : d;
          const head = groupDay !== lastDay ? <div className="dayhead">{groupDay === 'ongoing' ? t.ongoing : fmtDayLong(d, lang, t)}</div> : null;
          lastDay = groupDay;
          const cat = primaryCat(ev);
          const community = isCommunitySubmitted(ev);
          return (
            <div key={ev.id}>
              {head}
              <button className={`row ${whenMode === 'range' ? 'range-match' : ''} ${selected?.id === ev.id ? 'active' : ''}`} style={{ '--cc': CATS[cat].color }} onClick={() => onPick(ev)}>
                <span className="thumb"><CatIcon cat={cat} size={17} /></span>
                <span className="tx">
                  <span className="t">{ev.title}</span>
                  <span className="m">
                    {ev.all_day ? t.allDay : ev.starts_at.slice(11, 16)} · {ev.town || ev.venue} · {distKm(refPoint, ev).toFixed(1).replace('.', ',')} km
                  </span>
                </span>
                {(community || ev.is_free === 1) && <span className="rowbadges">
                  {community && <span className="source-tag community">{t.communitySource}</span>}
                  {ev.is_free === 1 && <span className="tag">{t.freeTag}</span>}
                </span>}
              </button>
            </div>
          );
        })}
        {filteredPlaces.length > 0 && (
          <>
            {filteredEvents.length > 0 && <div className="dayhead">{t.kindPlaces}</div>}
            {filteredPlaces.map((pl) => {
              const cat = primaryCat(pl);
              const st = openStatus(pl.opening_hours);
              const community = isCommunitySubmitted(pl);
              return (
                <button key={pl.id} className={`row ${selected?.id === pl.id ? 'active' : ''}`} style={{ '--cc': CATS[cat].color }} onClick={() => onPick(pl)}>
                  <span className="thumb"><CatIcon cat={cat} size={17} /></span>
                  <span className="tx">
                    <span className="t">{pl.title}</span>
                    <span className="m">
                      {t.cats[cat]} · {pl.town || pl.venue} · {distKm(refPoint, pl).toFixed(1).replace('.', ',')} km
                    </span>
                  </span>
                  {(community || (!st.always && !st.unknown)) && <span className="rowbadges">
                    {community && <span className="source-tag community">{t.communitySource}</span>}
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
          {place ? placeHoursBlock(ev) : <div className="dwhen">{fmtWhen(ev, lang, t)}</div>}
          <div className="dtags">
            {(ev.categories || []).filter((c) => CATS[c]).map((c) => (
              <span key={c} className="dtag" style={{ '--cc': CATS[c].color }}>
                <CatIcon cat={c} size={11} /> {t.cats[c]}
              </span>
            ))}
            {ev.is_free === 1 && <span className="dtag" style={{ '--cc': '#2e7d4f' }}>{t.freeTag}</span>}
            {ev.indoor === 1 && <span className="dtag" style={{ '--cc': '#6d7876' }}>{t.indoorTag}</span>}
            {ev.indoor === 0 && <span className="dtag" style={{ '--cc': '#6d7876' }}>{t.outdoorTag}</span>}
          </div>
          <div className="dmeta">
            <div><span className="k">📍</span><span>{[ev.venue, ev.address, ev.town].filter(Boolean).join(', ') || '—'}</span></div>
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
              {ev.geo_precision === 'town' && <> · {t.posApprox}</>}
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
            {/* Future: favorite/star action slot goes here */}
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
            <input ref={fileInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
            <div className="intake-card">
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
                <span className="intake-icon primary"><Camera size={23} weight="bold" /></span>
                <span className="intake-copy"><b>{t.scanPrompt}</b><small>{t.scanPromptSub}</small></span>
                <CaretRight className="intake-chevron" size={18} weight="bold" />
              </button>

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
                <button className={`toggle ${draft.always_open ? 'on' : ''}`} onClick={() => setDraft({ ...draft, always_open: !draft.always_open })}>
                  {t.alwaysOpen} <span className="knob" />
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
            <button className={`toggle ${draft.is_free ? 'on' : ''}`} onClick={() => setDraft({ ...draft, is_free: !draft.is_free })}>
              {t.freeEntry} <span className="knob" />
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
            <div className="chiprow" style={{ padding: '0 18px 12px' }}>
              {quickFilters}
              <button className={`chip ${showFilters || advancedFilterCount > 0 ? 'on' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                ⚙︎ {t.filters} {advancedFilterCount > 0 && <span className="badge">{advancedFilterCount}</span>}
              </button>
              <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{filtered.length} {t.events}</span>
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
            <span><i className="legend-pin event approximate" />{t.legendApprox}</span>
            <span><i className="legend-pin series">3</i>{t.legendSeries}</span>
            <span><i className="legend-pin event count" />{t.moreAtVenue}</span>
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
                ☰ {filtered.length}
              </button>
            </div>
          </div>
        )}

        {/* mobile sheet (filters / list) */}
        <section className={`m-sheet mobileonly ${sheet !== 'closed' ? sheet : ''}`}>
          <button className="grabber" onClick={() => setSheet(sheet === 'full' ? 'half' : 'full')} aria-label={t.resizePanel}><i /></button>
          <div className="m-sheethead">
            <b>{sheetContent === 'filters' ? t.filters : `${filtered.length} ${t.events}`}</b>
            <button className="m-close" onClick={() => setSheet('closed')} aria-label={t.close}><X size={14} weight="bold" /></button>
          </div>
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

        {/* round "+" FAB — opens the unified intake; hidden while adding or in full-screen detail */}
        <button
          className={`fab ${capture || (selected && detailFull) ? 'hidden' : ''} ${selected && !detailFull ? 'lifted' : ''} ${sheet === 'half' ? 'above-sheet' : ''}`}
          onClick={openCapture}
          aria-label={t.addToMap}
        >
          +
        </button>

        <button
          className={`locate-btn ${capture ? 'hidden' : ''} ${selected && !detailFull ? 'lifted' : ''} ${sheet === 'half' ? 'above-sheet' : ''} ${locating ? 'locating' : ''} ${locating || (located && !searchCenter) ? 'active' : ''}`}
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
              <p className="nl-done">{t.nlThanks}</p>
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
                  <fieldset className="nl-interest-field">
                    <legend>{t.nlInterests}</legend>
                    <p>{t.nlInterestsHelp}</p>
                    <div className="nl-category-grid">
                      {EVENT_CATS.map((category) => {
                        const selectedCategory = nl.categories.includes(category);
                        const disabledCategory = !selectedCategory && nl.categories.length >= 3;
                        return (
                          <button
                            key={category}
                            type="button"
                            className={selectedCategory ? 'selected' : ''}
                            disabled={disabledCategory}
                            aria-pressed={selectedCategory}
                            onClick={() => toggleNewsletterCategory(category)}
                          >
                            <CatIcon cat={category} size={15} />
                            <span>{t.cats[category]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  <label className="nl-radius-field">
                    <span>{t.nlRadius.replace('{count}', nl.radiusKm)}</span>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      step="5"
                      value={nl.radiusKm}
                      onChange={(e) => setNl((s) => ({ ...s, radiusKm: Number(e.target.value) }))}
                    />
                  </label>
                  <button type="submit" className="nl-submit" disabled={nl.busy}>{nl.busy ? t.nlSending : t.nlSubmit}</button>
                </form>
                {nl.err && <p className="nl-err">{nl.err}</p>}
                <p className="nl-fine">{t.nlConsent} <a href="/datenschutz" target="_blank" rel="noreferrer">{t.privacyLink}</a></p>
              </>
            )}
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
