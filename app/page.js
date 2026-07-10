'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CATS, CatIcon, catIconSvg } from '../lib/icons.js';
import { STRINGS, detectLang } from '../lib/i18n.js';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const HOME = { lat: 48.3, lng: 14.29 }; // Linz fallback

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
  return lang === 'de' ? 'de-AT' : 'en-GB';
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
function makeIcs(ev) {
  const dt = (iso) => iso.replace(/[-:]/g, '');
  let dtLines;
  if (ev.all_day) {
    const lastDay = (ev.ends_at || ev.starts_at).slice(0, 10);
    const end = new Intl.DateTimeFormat('en-CA').format(new Date(new Date(lastDay + 'T12:00').getTime() + 86400000)).replace(/-/g, '');
    dtLines = [`DTSTART;VALUE=DATE:${ev.starts_at.slice(0, 10).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${end}`];
  } else {
    const end = ev.ends_at || `${ev.starts_at.slice(0, 11)}${String(Math.min(23, +ev.starts_at.slice(11, 13) + 2)).padStart(2, '0')}${ev.starts_at.slice(13, 16)}`;
    dtLines = [`DTSTART;TZID=Europe/Vienna:${dt(ev.starts_at)}00`, `DTEND;TZID=Europe/Vienna:${dt(end)}00`];
  }
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umkreis//DE', 'BEGIN:VEVENT',
    `UID:umkreis-${ev.id}@local`, ...dtLines,
    `SUMMARY:${ev.title}`,
    `LOCATION:${[ev.venue, ev.address, ev.town].filter(Boolean).join(', ')}`,
    ev.description ? `DESCRIPTION:${ev.description}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ev.title.slice(0, 40).replace(/[^\wäöüÄÖÜß -]/g, '')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
async function downscale(file, maxEdge = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 3.5 * 1024 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));
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
        <button className="dp-nav" onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))} aria-label="prev">‹</button>
        <b>{monthName}</b>
        <button className="dp-nav" onClick={() => setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))} aria-label="next">›</button>
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

/* ==================================================================== */
export default function Home() {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markers = useRef(new Map());
  const fileInput = useRef(null);

  const [lang, setLang] = useState('de');
  const t = STRINGS[lang];
  useEffect(() => setLang(detectLang()), []);
  function switchLang() {
    const next = lang === 'de' ? 'en' : 'de';
    setLang(next);
    localStorage.setItem('umkreis-lang', next);
  }

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

  // filters
  const [whenMode, setWhenMode] = useState('all'); // all | today | tomorrow | weekend | next7 | range
  const [range, setRange] = useState({ from: null, to: null });
  const [dpOpen, setDpOpen] = useState(false);
  const [dpDraft, setDpDraft] = useState({ from: null, to: null });
  const [radius, setRadius] = useState(20);
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
  const [toast, setToast] = useState('');
  const toastT = useRef(null);

  // scan flow
  const [capture, setCapture] = useState(false);
  const [scanState, setScanState] = useState('pick');
  const [scanImg, setScanImg] = useState(null);
  const [scanErr, setScanErr] = useState('');
  const [draft, setDraft] = useState(null);
  const [photoPath, setPhotoPath] = useState(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(''), 2800);
  }

  async function loadEvents() {
    const res = await fetch('/api/events');
    const data = await res.json();
    setEvents(data.events);
  }
  useEffect(() => { loadEvents(); }, []);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (distKm(loc, HOME) < 80) setMe(loc);
      },
      () => {},
      { timeout: 4000 }
    );
  }, []);

  /* ---------------- map ---------------- */
  const geoRef = useRef({ me: HOME, radius: 20 });
  geoRef.current = { me, radius };
  const selectRef = useRef(() => {});

  useEffect(() => {
    if (mapObj.current || !mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE,
      center: [HOME.lng, HOME.lat],
      zoom: 10.6,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.addSource('radius', { type: 'geojson', data: circleGeoJSON(geoRef.current.me, geoRef.current.radius) });
      map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#C93A5B', 'fill-opacity': 0.035 } });
      map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#C93A5B', 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [3, 3] } });
    });
    map.on('click', () => selectRef.current(null, { fly: false }));
    const meEl = document.createElement('div');
    meEl.className = 'me-marker';
    new maplibregl.Marker({ element: meEl }).setLngLat([HOME.lng, HOME.lat]).addTo(map);
    map.on('error', (e) => console.error('[maplibre]', e?.error?.message || e));
    if (typeof window !== 'undefined') window.__umkreisMap = map;
    mapObj.current = map;
    return () => {
      map.remove();
      mapObj.current = null;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const src = mapObj.current?.getSource('radius');
    if (src) src.setData(circleGeoJSON(me, radius));
  }, [me, radius]);

  function selectEvent(ev, { fly = true } = {}) {
    setSelected(ev);
    setDetailFull(false);
    if (ev) {
      for (const [id, rec] of markers.current) rec.el.classList.toggle('selected', id === ev.id);
      if (fly && mapObj.current) {
        mapObj.current.flyTo({
          center: [ev.lng, ev.lat],
          zoom: Math.max(mapObj.current.getZoom(), 12.5),
          padding: isDesktop ? { left: 0 } : { bottom: 180 },
          duration: 700,
        });
      }
    } else {
      for (const rec of markers.current.values()) rec.el.classList.remove('selected');
    }
  }
  selectRef.current = selectEvent;

  // markers — full sync
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !events) return;
    const ids = new Set(events.map((e) => e.id));
    for (const [id, rec] of markers.current) {
      if (!ids.has(id)) {
        rec.marker.remove();
        markers.current.delete(id);
      }
    }
    for (const ev of events) {
      const cat = primaryCat(ev);
      const color = CATS[cat].color;
      const existing = markers.current.get(ev.id);
      if (existing) {
        existing.ev = ev;
        existing.el.style.setProperty('--cc', color);
        existing.el.innerHTML = catIconSvg(cat, 15);
        existing.el.className = 'pin2' + (ev.geo_precision === 'town' ? ' town-precision' : '');
        existing.marker.setLngLat([ev.lng, ev.lat]);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'pin2' + (ev.geo_precision === 'town' ? ' town-precision' : '');
      el.style.setProperty('--cc', color);
      el.innerHTML = catIconSvg(cat, 15);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectRef.current(markers.current.get(ev.id)?.ev || ev);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([ev.lng, ev.lat]).addTo(map);
      markers.current.set(ev.id, { marker, el, ev });
    }
  }, [events]);

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

  const filtered = useMemo(() => {
    if (!events) return [];
    return events
      .filter((ev) => {
        const d = ev.starts_at.slice(0, 10);
        const dEnd = (ev.ends_at || ev.starts_at).slice(0, 10);
        if (dEnd < dFrom || d > dTo) return false;
        if (distKm(me, ev) > radius) return false;
        if (cats.length && !ev.categories.some((c) => cats.includes(c))) return false;
        if (freeOnly && ev.is_free !== 1) return false;
        if (kidsOnly && !(ev.age_min != null || ev.categories.includes('family'))) return false;
        if (inOut === 'in' && ev.indoor !== 1) return false;
        if (inOut === 'out' && ev.indoor === 1) return false;
        if (tod.length && !ev.all_day) {
          const h = +ev.starts_at.slice(11, 13);
          const bucket = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
          if (!tod.includes(bucket)) return false;
        }
        return true;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [events, dFrom, dTo, radius, cats, freeOnly, kidsOnly, inOut, tod, me]);

  useEffect(() => {
    const visible = new Set(filtered.map((e) => e.id));
    for (const { el, ev } of markers.current.values()) {
      el.style.display = visible.has(ev.id) ? '' : 'none';
    }
    if (selected && !visible.has(selected.id)) selectEvent(null, { fly: false });
  }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const badge = (radius !== 20 ? 1 : 0) + cats.length + (freeOnly ? 1 : 0) + (kidsOnly ? 1 : 0) + (inOut !== 'any' ? 1 : 0) + tod.length;
  function resetFilters() {
    setRadius(20); setCats([]); setFreeOnly(false); setKidsOnly(false); setInOut('any'); setTod([]);
  }

  /* ---------------- scan flow ---------------- */
  function openCapture() {
    setCapture(true); setScanState('pick'); setScanImg(null); setScanErr(''); setDraft(null);
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
      const res = await fetch('/api/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      const x = data.extraction;
      if (!x.is_event) setScanErr(t.noEventDetected);
      setPhotoPath(data.photo_path);
      setDraft({
        title: x.title || '',
        date_start: x.date_start || todayStr(),
        time_start: x.time_start || '',
        venue: x.venue || '',
        address: x.address || '',
        town: x.town || 'Linz',
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
  async function publish() {
    if (!draft.title || !draft.date_start) { setScanErr(t.requiredErr); return; }
    setScanState('publishing');
    const body = {
      title: draft.title,
      description: draft.description || null,
      starts_at: `${draft.date_start}T${/^\d{2}:\d{2}$/.test(draft.time_start) ? draft.time_start : '09:00'}`,
      all_day: !/^\d{2}:\d{2}$/.test(draft.time_start),
      venue: draft.venue || null,
      address: draft.address || null,
      town: draft.town || 'Linz',
      categories: draft.categories.length ? draft.categories : ['family'],
      is_free: draft.is_free,
      photo_path: photoPath,
    };
    try {
      const res = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setCapture(false);
      await loadEvents();
      showToast(t.toastLive);
      setWhenMode('all');
    } catch (e) {
      setScanErr(String(e.message || e));
      setScanState('confirm');
    }
  }

  /* ---------------- shared subviews ---------------- */
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

  const filterPanel = (
    <div className="filters">
      <div className="fgroup">
        <h4>{t.radius} <output>{radius} km</output></h4>
        <input type="range" min="3" max="40" step="1" value={radius} onChange={(e) => setRadius(+e.target.value)} aria-label={t.radius} />
      </div>
      <div className="fgroup">
        <h4>{t.categories}</h4>
        <div className="catgrid">
          {Object.keys(CATS).map((key) => (
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
        <h4>{t.options}</h4>
        <div className="togglerow">
          <button className={`toggle ${freeOnly ? 'on' : ''}`} onClick={() => setFreeOnly(!freeOnly)}>
            {t.freeOnly} <span className="knob" />
          </button>
          <button className={`toggle ${kidsOnly ? 'on' : ''}`} onClick={() => setKidsOnly(!kidsOnly)}>
            {t.forKids} <span className="knob" />
          </button>
        </div>
      </div>
      {badge > 0 && <button className="resetbtn" onClick={resetFilters}>{t.reset}</button>}
    </div>
  );

  function eventList(onPick) {
    let lastDay = null;
    if (filtered.length === 0) {
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
        {filtered.map((ev) => {
          const d = ev.starts_at.slice(0, 10);
          const head = d !== lastDay ? <div className="dayhead">{fmtDayLong(d, lang, t)}</div> : null;
          lastDay = d;
          const cat = primaryCat(ev);
          return (
            <div key={ev.id}>
              {head}
              <button className={`row ${selected?.id === ev.id ? 'active' : ''}`} style={{ '--cc': CATS[cat].color }} onClick={() => onPick(ev)}>
                <span className="thumb"><CatIcon cat={cat} size={17} /></span>
                <span className="tx">
                  <span className="t">{ev.title}</span>
                  <span className="m">
                    {ev.all_day ? t.allDay : ev.starts_at.slice(11, 16)} · {ev.town || ev.venue} · {distKm(me, ev).toFixed(1).replace('.', ',')} km
                  </span>
                </span>
                {ev.is_free === 1 && <span className="tag">{t.freeTag}</span>}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function eventDetail(ev, { onBack, onClose }) {
    const cat = primaryCat(ev);
    return (
      <>
        <div className="dhero" style={{ '--cc': CATS[cat].color }}>
          <span className="heroicon"><CatIcon cat={cat} size={44} strokeWidth={1.6} /></span>
          {onBack && <button className="backbtn" onClick={onBack} aria-label={t.backToList}>←</button>}
          {onClose && <button className="closebtn" onClick={onClose} aria-label="close">✕</button>}
        </div>
        <div className="dbody">
          <h2>{ev.title}</h2>
          <div className="dwhen">{fmtWhen(ev, lang, t)}</div>
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
            <div><span className="k">🚗</span><span className="mutedt">{distKm(me, ev).toFixed(1).replace('.', ',')} km {t.away}</span></div>
            {ev.age_min != null && (
              <div><span className="k">👨‍👩‍👧</span><span className="mutedt">{t.ageRec.replace('{min}', ev.age_min).replace('{max}', ev.age_max ?? '99')}</span></div>
            )}
          </div>
          {ev.description && <p className="ddesc">{ev.description}</p>}
          <div className="prov">
            <span>{ev.src_kind === 'user_photo' ? '📷' : '🌐'}</span>
            <span>
              {t.source}:{' '}
              {ev.source_url ? (
                <a href={ev.source_url} target="_blank" rel="noreferrer">{ev.source_name || ev.source_url}</a>
              ) : (
                <b>{ev.source_name || 'Upload'}</b>
              )}
              {ev.geo_precision === 'town' && <> · {t.posApprox}</>}
            </span>
          </div>
          <div className="dactions">
            <a className="abtn" href={`https://www.google.com/maps/dir/?api=1&destination=${ev.lat},${ev.lng}`} target="_blank" rel="noreferrer">{t.route}</a>
            <button className="abtn" onClick={() => makeIcs(ev)}>＋ {t.calendar}</button>
            <button
              className="abtn primary"
              onClick={() => {
                const url = `${location.origin}/event/${ev.id}`;
                if (navigator.share) navigator.share({ title: ev.title, url }).catch(() => {});
                else navigator.clipboard.writeText(url).then(() => showToast(t.copied));
              }}
            >
              {t.share}
            </button>
          </div>
        </div>
      </>
    );
  }

  const conf = draft?.confidence;
  const confChip = (v) => (v == null ? null : <span className={`conf ${v >= 0.6 ? 'hi' : 'lo'}`}>{Math.round(v * 100)} %</span>);

  const captureView = (
    <section className={`capture ${capture ? 'show' : ''}`}>
      <div className="caphead">
        <h3>
          {scanState === 'pick' && t.scanTitle}
          {scanState === 'scanning' && t.scanReading}
          {scanState === 'confirm' && t.scanConfirm}
          {scanState === 'publishing' && t.scanPublishing}
        </h3>
        <button onClick={() => setCapture(false)}>{t.cancel}</button>
      </div>
      <div className="capbody">
        {scanErr && <div className="errbox">⚠️ {scanErr}</div>}
        {scanState === 'pick' && (
          <>
            <input ref={fileInput} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
            <div className="droparea" onClick={() => fileInput.current?.click()}>
              <span className="big">📷</span>
              <p><b>{t.scanPrompt}</b><br />{t.scanPromptSub}</p>
            </div>
          </>
        )}
        {scanState === 'scanning' && scanImg && (
          <>
            <div className="preview">
              <img src={scanImg} alt="" />
              <div className="scanline-wrap"><div className="scanline" /></div>
            </div>
            <div className="scanstatus">{t.scanExtracting}</div>
          </>
        )}
        {(scanState === 'confirm' || scanState === 'publishing') && draft && (
          <>
            {scanImg && <div className="preview" style={{ maxHeight: 120 }}><img src={scanImg} alt="" style={{ maxHeight: 120 }} /></div>}
            <div className="xfield">
              <div className="lab">{t.fTitle} {confChip(conf?.title)}</div>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
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
            <div className={`xfield ${conf?.location < 0.6 ? 'check' : ''}`}>
              <div className="lab">{t.fVenue} {confChip(conf?.location)}</div>
              <input value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} />
            </div>
            <div className="xrow">
              <div className="xfield">
                <div className="lab">{t.fAddress}</div>
                <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
              </div>
              <div className="xfield">
                <div className="lab">{t.fTown}</div>
                <input value={draft.town} onChange={(e) => setDraft({ ...draft, town: e.target.value })} />
              </div>
            </div>
            <div className="xfield">
              <div className="lab">{t.categories}</div>
              <div className="catgrid">
                {Object.keys(CATS).map((key) => (
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
  return (
    <div className="shell">
      {/* ===== desktop sidebar ===== */}
      <aside className="sidebar desktoponly">
        {selected && isDesktop ? (
          <div className="detail-side">{eventDetail(selected, { onBack: () => selectEvent(null, { fly: false }) })}</div>
        ) : (
          <>
            <div className="sidehead">
              <div className="brandrow">
                <span className="brand">Umkreis<span className="dot">.</span> <small>{t.brandTag}</small></span>
                <button className="langbtn" onClick={switchLang}>{lang === 'de' ? 'EN' : 'DE'}</button>
              </div>
            </div>
            <div className="chiprow" style={{ padding: '0 18px 10px' }}>{dateChips}</div>
            <div className="chiprow" style={{ padding: '0 18px 12px' }}>
              <button className={`chip ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                ⚙︎ {t.filters} {badge > 0 && <span className="badge">{badge}</span>}
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
        {!events && <div className="loading">Umkreis<span className="dot">.</span></div>}

        {/* mobile top bar */}
        <div className="m-topbar mobileonly">
          <span className="m-brand">Umkreis<span className="dot">.</span> <small>{t.brandTag}</small></span>
          <button className="langbtn" style={{ boxShadow: 'var(--shadow-md)' }} onClick={switchLang}>{lang === 'de' ? 'EN' : 'DE'}</button>
        </div>

        {/* mobile bottom chip bar */}
        {sheet === 'closed' && !selected && (
          <div className="m-bottombar mobileonly">
            <div className="chiprow">
              {dateChips}
              <button className="chip" onClick={() => { setSheetContent('filters'); setSheet('half'); }}>
                ⚙︎ {badge > 0 && <span className="badge">{badge}</span>}
              </button>
              <button className="chip" onClick={() => { setSheetContent('list'); setSheet('full'); }}>
                ☰ {filtered.length}
              </button>
            </div>
          </div>
        )}

        {/* mobile sheet (filters / list) */}
        <section className={`m-sheet mobileonly ${sheet !== 'closed' ? sheet : ''}`}>
          <button className="grabber" onClick={() => setSheet(sheet === 'full' ? 'half' : 'full')} aria-label="resize"><i /></button>
          <div className="m-sheethead">
            <b>{sheetContent === 'filters' ? t.filters : `${filtered.length} ${t.events}`}</b>
            <button className="m-close" onClick={() => setSheet('closed')}>✕</button>
          </div>
          <div className="m-sheetbody">
            {sheetContent === 'filters' ? (
              <>
                <div className="chiprow">{dateChips}</div>
                {filterPanel}
              </>
            ) : (
              eventList((ev) => { setSheet('closed'); selectEvent(ev); })
            )}
          </div>
        </section>

        {/* mini card (mobile google-maps style) */}
        {selected && !isDesktop && !detailFull && (
          <div className="minicard" style={{ '--cc': CATS[primaryCat(selected)].color }} onClick={() => setDetailFull(true)}>
            <span className="thumb"><CatIcon cat={primaryCat(selected)} size={19} /></span>
            <span className="tx">
              <span className="t">{selected.title}</span>
              <span className="w">{fmtWhenShort(selected, lang, t)}</span>
              <span className="m">{[selected.venue, selected.town].filter(Boolean).join(', ')} · {distKm(me, selected).toFixed(1).replace('.', ',')} km</span>
            </span>
            <button className="morebtn" onClick={(e) => { e.stopPropagation(); setDetailFull(true); }}>{t.learnMore}</button>
            <button className="xbtn" onClick={(e) => { e.stopPropagation(); selectEvent(null, { fly: false }); }} aria-label="close">✕</button>
          </div>
        )}

        {/* full-screen detail (mobile) */}
        {selected && !isDesktop && detailFull && (
          <div className="detail-full">{eventDetail(selected, { onBack: () => setDetailFull(false), onClose: () => selectEvent(null, { fly: false }) })}</div>
        )}

        <button className={`fab ${capture ? 'hidden' : ''}`} onClick={openCapture} aria-label={t.scanTitle}>📷</button>
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

      {captureView}
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}
