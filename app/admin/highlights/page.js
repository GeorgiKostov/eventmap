'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Highlights desk: set/clear paid ("gold") and editorial event placement
// (db/schema.sql `highlights`, app/api/admin/highlights/route.js). Search an
// event, pick a tier and a date range, hit "Set highlight" — mapPins picks up
// the strongest active period automatically (lib/db.js highlightJoin()).
//
// Auth scaffold copied verbatim from app/admin/thursday/page.js — same
// password-cookie flow (lib/admin-auth.js), same style object.

const S = {
  page: { minHeight: '100vh', background: '#F2F2EE', color: '#212B28', fontFamily: 'system-ui, sans-serif', padding: '24px 16px' },
  wrap: { maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' },
  card: { background: '#fff', borderRadius: 14, padding: 20, marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: 800, margin: '0 0 4px' },
  muted: { color: '#4A5652', fontSize: 14 },
  btn: { background: '#C93A5B', color: '#fff', border: 0, borderRadius: 9, padding: '11px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  ghost: { background: '#fff', color: '#212B28', border: '1px solid #DCDCD6', borderRadius: 9, padding: '10px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  item: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid #EEEEE9' },
  input: { width: '100%', boxSizing: 'border-box', padding: '11px 13px', fontSize: 14, border: '1px solid #DCDCD6', borderRadius: 9 },
  subhead: { fontWeight: 700, fontSize: 13, margin: '18px 0 8px' },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 9px', display: 'inline-block' },
  tierBtn: (on, color) => ({
    ...S.ghost, borderColor: on ? color : '#DCDCD6', color: on ? color : '#212B28',
    background: on ? `${color}1A` : '#fff', fontWeight: 700,
  }),
};

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

export default function HighlightsPage() {
  const [authed, setAuthed] = useState(null);
  const [password, setPassword] = useState('');
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

  useEffect(() => {
    fetch('/api/admin/login')
      .then((r) => r.json())
      .then((j) => setAuthed(!!j.authed))
      .catch(() => setAuthed(false));
  }, []);

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

  useEffect(() => {
    if (authed) loadHighlights();
  }, [authed, loadHighlights]);

  async function login(e) {
    e.preventDefault();
    setBusy('login');
    setErr('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'login failed');
      setPassword('');
      setAuthed(true);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy('');
    }
  }

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setAuthed(false);
    setHighlights(null);
  }

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

  if (authed === null) {
    return (
      <div style={S.page}>
        <div style={{ ...S.wrap, ...S.card }}><p style={S.muted}>…</p></div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={S.page}>
        <div style={{ maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', ...S.card, marginTop: '12vh' }}>
          <h1 style={S.h1}>Highlights desk</h1>
          <p style={{ ...S.muted, margin: '0 0 16px' }}>Enter the admin password.</p>
          <form onSubmit={login}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              style={{ ...S.input, marginBottom: 10 }}
            />
            <button type="submit" style={{ ...S.btn, width: '100%' }} disabled={busy === 'login' || !password}>
              {busy === 'login' ? 'Checking…' : 'Log in'}
            </button>
          </form>
          {err ? <p style={{ color: '#C93A5B', fontSize: 13, margin: '12px 0 0' }}>{err}</p> : null}
        </div>
      </div>
    );
  }

  const active = (highlights || []).filter((h) => h.active);
  const inactive = (highlights || []).filter((h) => !h.active);

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={{ ...S.row, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={S.h1}>Highlights desk</h1>
              <p style={{ ...S.muted, margin: '0 0 4px' }}>Set or clear paid/editorial event placement.</p>
            </div>
            <button style={S.ghost} onClick={logout}>Log out</button>
          </div>
        </div>

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
