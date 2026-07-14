'use client';

import { useCallback, useEffect, useState } from 'react';

// The Thursday desk (docs/ops/weekly-automation.md §3). Everything George needs
// for the weekly growth motion on one screen: this weekend's picks, the 6
// carousel cards to download, the caption to paste, the email preview, and the
// send button. ~10 minutes, once a week, per city.
//
// Auth is the ADMIN_TOKEN in the URL (?token=…) — same shared secret as the
// one-click removal links. Prototype-grade and deliberately so.

const S = {
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
};

export default function ThursdayPage() {
  const [token, setToken] = useState('');
  const [channel, setChannel] = useState('linz');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setToken(p.get('token') || '');
    if (p.get('channel')) setChannel(p.get('channel'));
  }, []);

  const load = useCallback(async (slug, tok) => {
    if (!tok) return;
    setBusy('load');
    setErr('');
    try {
      const res = await fetch(`/api/admin/digest?channel=${slug}&token=${encodeURIComponent(tok)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');
      setData(json);
    } catch (e) {
      setErr(e.message);
      setData(null);
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    if (token) load(channel, token);
  }, [token, channel, load]);

  async function act(action, extra = {}) {
    setBusy(action);
    setErr('');
    setNote('');
    try {
      const res = await fetch('/api/admin/digest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, channel, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');
      if (action === 'send') {
        setNote(json.test ? `Test sent to ${json.to}` : `Sent to ${json.sent} of ${json.audience} subscribers${json.failed ? ` (${json.failed} failed)` : ''}`);
        await load(channel, token);
      } else {
        setData(json);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  if (!token) {
    return (
      <div style={S.page}>
        <div style={{ ...S.wrap, ...S.card }}>
          <h1 style={S.h1}>Thursday desk</h1>
          <p style={S.muted}>Add your admin token to the URL: <code>/admin/thursday?token=…</code></p>
        </div>
      </div>
    );
  }

  // Cards need no token: they're our own marketing art, and a public URL is
  // what an Instagram/Facebook Graph API post would have to fetch later anyway.
  const cardUrl = (path) => path;

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <div style={S.card}>
          <h1 style={S.h1}>Thursday desk</h1>
          <p style={{ ...S.muted, margin: '0 0 14px' }}>
            Weekend picks → carousel + caption + newsletter. Post manually, send when it looks right.
          </p>
          <div style={S.row}>
            {(data?.channels || [{ slug: 'linz', label: 'Linz' }]).map((c) => (
              <button key={c.slug} style={S.tab(c.slug === channel)} onClick={() => setChannel(c.slug)}>
                {c.label}
              </button>
            ))}
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

        {busy === 'load' && !data ? <div style={S.card}>Loading…</div> : null}

        {data ? (
          <>
            <div style={S.card}>
              <div style={{ ...S.row, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{data.digest.label}</div>
                  <div style={S.muted}>
                    {data.digest.items.length} picks · {data.audience} confirmed subscriber{data.audience === 1 ? '' : 's'} in this catchment ·
                    copy: {data.digest.copyModel || 'template fallback'}
                    {data.sentAt ? ` · sent ${new Date(data.sentAt).toLocaleString()}` : ''}
                  </div>
                </div>
                <button style={S.ghost} disabled={!!busy} onClick={() => act('regenerate')}>
                  {busy === 'regenerate' ? 'Rebuilding…' : '↻ Regenerate picks + copy'}
                </button>
              </div>

              {data.digest.items.map((it, i) => (
                <div key={it.id} style={S.item}>
                  <div style={{ fontWeight: 800, color: '#C93A5B', width: 22 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <a href={`/event/${it.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: '#212B28', textDecoration: 'none' }}>
                      {it.title}
                    </a>
                    <div style={{ ...S.muted, color: '#C93A5B', fontWeight: 600 }}>
                      {it.when}{it.venue ? ` · ${it.venue}` : ''}
                    </div>
                    {it.teaser ? <div style={S.muted}>{it.teaser}</div> : null}
                    <div style={{ ...S.muted, fontSize: 12 }}>{it.badges.join(' · ')}</div>
                  </div>
                  <button style={S.ghost} disabled={!!busy} onClick={() => act('drop', { id: it.id })}>
                    Drop
                  </button>
                </div>
              ))}
              {!data.digest.items.length ? <p style={S.muted}>No events match this weekend in this catchment.</p> : null}
            </div>

            {data.digest.items.length ? (
              <>
                <div style={S.card}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>1 · Carousel (1080×1350) — right-click → save, or open each</div>
                  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                    {data.cards.map((c, i) => (
                      <a key={c} href={cardUrl(c)} target="_blank" rel="noreferrer" download={`okolo-${channel}-${i}.png`}>
                        <img
                          src={cardUrl(c)}
                          alt={`slide ${i}`}
                          width={144}
                          height={180}
                          style={{ borderRadius: 8, border: '1px solid #DCDCD6', background: '#fff' }}
                        />
                      </a>
                    ))}
                  </div>
                </div>

                <div style={S.card}>
                  <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontWeight: 700 }}>2 · Caption ({data.digest.channel?.handle || channel})</div>
                    <button style={S.ghost} onClick={() => navigator.clipboard.writeText(data.caption).then(() => setNote('Caption copied'))}>
                      Copy caption
                    </button>
                  </div>
                  <pre style={S.pre}>{data.caption}</pre>
                </div>

                <div style={S.card}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>3 · Newsletter</div>
                  <div style={{ ...S.muted, marginBottom: 10 }}>Subject: <strong>{data.subject}</strong></div>
                  <iframe
                    title="preview"
                    srcDoc={data.html}
                    style={{ width: '100%', height: 520, border: '1px solid #DCDCD6', borderRadius: 10, background: '#fff' }}
                  />
                  <div style={{ ...S.row, marginTop: 12 }}>
                    <button style={S.ghost} disabled={!!busy} onClick={() => act('send', { test: true })}>
                      Send test to me
                    </button>
                    <button
                      style={S.btn}
                      disabled={!!busy || !data.audience}
                      onClick={() => {
                        if (confirm(`Send to ${data.audience} confirmed subscribers around ${channel}?`)) act('send', { force: !!data.sentAt });
                      }}
                    >
                      {busy === 'send' ? 'Sending…' : data.sentAt ? `Re-send to ${data.audience}` : `Send to ${data.audience}`}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
