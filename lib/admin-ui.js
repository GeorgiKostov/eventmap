'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Shared shell for every /admin/* desk (Thursday, Highlights, Pages, the hub).
// Before this file, the login/logout/auth-check block existed three times —
// exactly the drift tasks/lessons.md warns about ("N copies of one helper is
// N different behaviours — the third copy is where it stops being duplication
// and starts being drift"). `S` is lifted VERBATIM from the original Thursday
// desk (it's the superset); Highlights' two extra keys (`input`, `tierBtn`)
// are folded in so neither desk regresses.

export const S = {
  page: { minHeight: '100vh', background: '#F2F2EE', color: '#212B28', fontFamily: 'system-ui, sans-serif', padding: '24px 16px' },
  // marginLeft/Right, not the `margin` shorthand: this object gets spread
  // together with S.card (which sets marginBottom), and React warns — rightly —
  // that mixing shorthand with longhand for the same property is a styling bug
  // waiting to happen.
  wrap: { maxWidth: 960, marginLeft: 'auto', marginRight: 'auto' },
  card: { background: '#fff', borderRadius: 14, padding: 20, marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: 800, margin: '0 0 4px' },
  muted: { color: '#4A5652', fontSize: 14 },
  btn: { background: '#C93A5B', color: '#fff', border: 0, borderRadius: 9, padding: '11px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  ghost: { background: '#fff', color: '#212B28', border: '1px solid #DCDCD6', borderRadius: 9, padding: '10px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  item: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid #EEEEE9' },
  pre: { whiteSpace: 'pre-wrap', background: '#F7F7F4', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.6, margin: 0 },
  tab: (on) => ({ ...S.ghost, background: on ? '#212B28' : '#fff', color: on ? '#fff' : '#212B28', borderColor: on ? '#212B28' : '#DCDCD6' }),
  subhead: { fontWeight: 700, fontSize: 13, margin: '18px 0 8px' },
  dot: (color) => ({ width: 8, height: 8, borderRadius: 999, background: color || '#999', display: 'inline-block', marginRight: 7, flexShrink: 0 }),
  thumb: { width: 72, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #E4E4DD', background: '#fff', display: 'block' },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '2px 9px', textDecoration: 'none', display: 'inline-block' },
  chipPosted: { color: '#2E9C8C', background: '#EAF7F3' },
  chipCarousel: { color: '#6D7876', background: '#F0F0EC', fontWeight: 600 },
  tierChip: { fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, marginLeft: 6, letterSpacing: 0.2 },
  previewPanel: { border: '1px dashed #DCDCD6', borderRadius: 10, padding: 14, marginBottom: 16, background: '#FAFAF7' },
  reorderBtn: (edge) => ({ background: 'none', border: 0, padding: 0, fontSize: 11, lineHeight: 1, color: edge ? '#D2D2CC' : '#6D7876', cursor: edge ? 'default' : 'pointer' }),
  // ---- from the Highlights desk ----
  input: { width: '100%', boxSizing: 'border-box', padding: '11px 13px', fontSize: 14, border: '1px solid #DCDCD6', borderRadius: 9 },
  tierBtn: (on, color) => ({
    ...S.ghost, borderColor: on ? color : '#DCDCD6', color: on ? color : '#212B28',
    background: on ? `${color}1A` : '#fff', fontWeight: 700,
  }),
};

// Vienna-pinned, compact: "Mi 15.7. 14:02" (de-AT locale, per CLAUDE.md rule 3
// — this is a display formatter only, not a time computation, but it still
// must show the wall-clock Vienna time something actually happened at).
export function formatVienna(iso) {
  if (!iso) return '';
  try {
    const parts = new Intl.DateTimeFormat('de-AT', {
      timeZone: 'Europe/Vienna', weekday: 'short', day: '2-digit', month: 'numeric', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(iso));
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('weekday')} ${get('day')}.${get('month')}. ${get('hour')}:${get('minute')}`;
  } catch {
    return '';
  }
}

const NAV = [
  { href: '/admin', label: 'Home' },
  { href: '/admin/thursday', label: 'Thursday' },
  { href: '/admin/highlights', label: 'Highlights' },
  { href: '/admin/pages', label: 'Pages' },
];

// Auth is a PASSWORD, not a URL token: you type it once, the server sets an
// httpOnly signed cookie, and you stay logged in on that device for 30 days. A
// `?token=` in the URL would sit in browser history, in the Referer of every
// outbound link, and in any screen-share. See lib/admin-auth.js.
//
// While unauthed, renders the login card and nothing else — so `children`
// never mounts before the cookie check resolves, and every desk's own effects
// (data loads) only ever fire once actually logged in.
export function AdminShell({ title, subtitle, children }) {
  const pathname = usePathname();
  const [authed, setAuthed] = useState(null); // null = still checking
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/admin/login')
      .then((r) => r.json())
      .then((j) => setAuthed(!!j.authed))
      .catch(() => setAuthed(false));
  }, []);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
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
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setAuthed(false);
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
          <h1 style={S.h1}>{title || 'Okolo admin'}</h1>
          <p style={{ ...S.muted, margin: '0 0 16px' }}>Enter the admin password.</p>
          <form onSubmit={login}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 15,
                border: '1px solid #DCDCD6', borderRadius: 9, marginBottom: 10,
              }}
            />
            <button type="submit" style={{ ...S.btn, width: '100%' }} disabled={busy || !password}>
              {busy ? 'Checking…' : 'Log in'}
            </button>
          </form>
          {err ? <p style={{ color: '#C93A5B', fontSize: 13, margin: '12px 0 0' }}>{err}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={{ ...S.row, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={S.h1}>{title}</h1>
              {subtitle ? <p style={{ ...S.muted, margin: '0 0 14px' }}>{subtitle}</p> : null}
            </div>
            <button style={S.ghost} onClick={logout}>Log out</button>
          </div>
          <div style={S.row}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} style={{ ...S.tab(pathname === n.href), textDecoration: 'none', display: 'inline-block' }}>
                {n.label}
              </Link>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
