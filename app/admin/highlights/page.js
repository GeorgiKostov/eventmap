'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { S, AdminShell } from '../../../lib/admin-ui.js';

// Highlights desk: set/clear paid ("gold") and editorial event placement
// (db/schema.sql `highlights`, app/api/admin/highlights/route.js). Search an
// event, pick a tier and a date range, hit "Set highlight" — mapPins picks up
// the strongest active period automatically (lib/db.js highlightJoin()).
//
// Auth/nav/logout chrome lives in AdminShell (lib/admin-ui.js).

// Narrower than the shared S.wrap (960): this desk is a search form, not a
// wide dashboard.
const WRAP = { maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' };

const TIERS = [
  { id: 'gold', label: 'Gold', color: '#E8A800' },
  { id: 'editorial', label: 'Editorial', color: '#C93A5B' },
];
const tierColor = (t) => TIERS.find((x) => x.id === t)?.color || '#999';

// Vienna-pinned date helpers (CLAUDE.md rule 3) — mirrors app/page.js's
// todayStr()/addDays(), duplicated here rather than imported since that file
// exports nothing and belongs to the map-client agent's surface.
function todayStr(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(d);
}
function addDays(dateStr, n) {
  const t = new Date(`${dateStr}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(t);
}

// Desk body is a CHILD of AdminShell, not its parent — see the same note in
// app/admin/thursday/page.js: a parent's effects run whatever it renders, so
// loading here would 403 while logged out and never retry after login.
export default function HighlightsPage() {
  return (
    <AdminShell title="Highlights desk" subtitle="Set or clear paid/editorial event placement.">
      <HighlightsDesk />
    </AdminShell>
  );
}

function HighlightsDesk() {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const [highlights, setHighlights] = useState(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const searchDebounce = useRef(null);
  const searchReqId = useRef(0);

  const [selected, setSelected] = useState(null); // full event row, once resolved
  const [tier, setTier] = useState('gold');
  const [startsAt, setStartsAt] = useState(todayStr());
  const [endsAt, setEndsAt] = useState(todayStr(14));
  const [formNote, setFormNote] = useState('');

  const loadHighlights = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/highlights');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed to load');
      setHighlights(json.highlights);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  // AdminShell doesn't mount this component until the session is confirmed.
  useEffect(() => { loadHighlights(); }, [loadHighlights]);

  // Debounced global event search (≥2 chars, 400ms) — same endpoint the map's
  // own search box uses.
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    searchDebounce.current = setTimeout(async () => {
      const reqId = ++searchReqId.current;
      try {
        const res = await fetch(`/api/events?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (reqId === searchReqId.current) setResults(Array.isArray(json.results) ? json.results : []);
      } catch {
        if (reqId === searchReqId.current) setResults([]);
      }
    }, 400);
    return () => clearTimeout(searchDebounce.current);
  }, [query]);

  // Selecting a search hit resolves the full row (need ends_at/status to set
  // sane defaults and to let the server's published-check give an honest error).
  async function selectResult(hit) {
    setErr('');
    setResults([]);
    setQuery(hit.title);
    try {
      const res = await fetch(`/api/events?id=${encodeURIComponent(hit.id)}`);
      const json = await res.json();
      const ev = json.event || hit;
      setSelected(ev);
      const today = todayStr();
      const lastDay = (ev.ends_at || ev.starts_at || '').slice(0, 10);
      setStartsAt(today);
      setEndsAt(lastDay && lastDay > today ? lastDay : addDays(today, 14));
      setTier('gold');
      setFormNote('');
    } catch (e) {
      setErr(e.message);
    }
  }

  async function submitHighlight() {
    if (!selected) return;
    setBusy('set');
    setErr('');
    setNote('');
    try {
      const res = await fetch('/api/admin/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: selected.id, tier, startsAt, endsAt, note: formNote || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');
      setNote(`Highlight set: "${selected.title}" (${tier}, ${startsAt} → ${endsAt})`);
      setSelected(null);
      setQuery('');
      await loadHighlights();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function clear(id, title) {
    if (!confirm(`Clear the highlight for "${title}"?`)) return;
    setBusy(`clear-${id}`);
    setErr('');
    try {
      const res = await fetch('/api/admin/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'clear', id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');
      await loadHighlights();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const active = (highlights || []).filter((h) => h.active);
  const inactive = (highlights || []).filter((h) => !h.active);

  return (
    <div style={WRAP}>
        {err ? (
          <div style={{ ...S.card, borderLeft: '4px solid #C93A5B' }}>
            <strong>Error:</strong> {err}
          </div>
        ) : null}
        {note ? (
          <div style={{ ...S.card, borderLeft: '4px solid #2E9C8C' }}>{note}</div>
        ) : null}

        <div style={S.card}>
          <div style={S.subhead}>Find an event</div>
          <input
            style={S.input}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search by title, venue, or town…"
          />
          {results.length ? (
            <div style={{ marginTop: 6 }}>
              {results.map((r) => (
                <div
                  key={r.id}
                  style={{ ...S.item, borderTop: 0, cursor: 'pointer', padding: '8px 0' }}
                  onClick={() => selectResult(r)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                    <div style={S.muted}>
                      {[r.town, (r.starts_at || '').slice(0, 10)].filter(Boolean).join(' · ')}
                      {r.highlight ? <span style={{ ...S.chip, marginLeft: 6, background: `${tierColor(r.highlight)}1A`, color: tierColor(r.highlight) }}>{r.highlight}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {selected ? (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #EEEEE9' }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>
                {selected.title}
                <span style={{ ...S.muted, fontWeight: 400 }}>
                  {' — '}{[selected.town, (selected.starts_at || '').slice(0, 10)].filter(Boolean).join(' · ')}
                </span>
              </div>

              <div style={{ ...S.row, marginBottom: 12 }}>
                {TIERS.map((t) => (
                  <button key={t.id} style={S.tierBtn(tier === t.id, t.color)} onClick={() => setTier(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={{ ...S.row, marginBottom: 12 }}>
                <label style={{ ...S.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  From
                  <input type="date" style={S.input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </label>
                <label style={{ ...S.muted, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  To
                  <input type="date" style={S.input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </label>
              </div>

              <input
                style={{ ...S.input, marginBottom: 12 }}
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Note (internal — who paid / why showcased)"
              />

              <div style={S.row}>
                <button style={S.btn} disabled={busy === 'set'} onClick={submitHighlight}>
                  {busy === 'set' ? 'Setting…' : 'Set highlight'}
                </button>
                <button style={S.ghost} onClick={() => { setSelected(null); setQuery(''); }}>Cancel</button>
              </div>
            </div>
          ) : null}
        </div>

        <div style={S.card}>
          <div style={S.subhead}>Active now</div>
          {!active.length ? <p style={S.muted}>No active highlights.</p> : null}
          {active.map((h) => (
            <HighlightRow key={h.id} h={h} busy={busy} onClear={clear} />
          ))}

          <div style={S.subhead}>Scheduled / past</div>
          {!inactive.length ? <p style={S.muted}>None.</p> : null}
          {inactive.map((h) => (
            <HighlightRow key={h.id} h={h} busy={busy} onClear={clear} />
          ))}
        </div>
    </div>
  );
}

function HighlightRow({ h, busy, onClear }) {
  return (
    <div style={S.item}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <span style={{ fontWeight: 600 }}>{h.event_title}</span>
          <span style={{ ...S.chip, marginLeft: 8, background: `${tierColor(h.tier)}1A`, color: tierColor(h.tier) }}>{h.tier}</span>
        </div>
        <div style={S.muted}>
          {[h.event_town, `${h.starts_at} → ${h.ends_at}`].filter(Boolean).join(' · ')}
          {h.event_status !== 'published' ? ` · event ${h.event_status}` : ''}
        </div>
        {h.note ? <div style={{ ...S.muted, fontSize: 12 }}>{h.note}</div> : null}
      </div>
      <button style={S.ghost} disabled={busy === `clear-${h.id}`} onClick={() => onClear(h.id, h.event_title)}>
        {busy === `clear-${h.id}` ? 'Clearing…' : 'Clear'}
      </button>
    </div>
  );
}
