'use client';

import { useCallback, useEffect, useState } from 'react';

// The Thursday desk (docs/ops/weekly-automation.md §3). Everything George needs
// for the weekly growth motion on one screen: this weekend's picks, the 6
// carousel cards to download, the caption to paste, the email preview, and the
// send button. ~10 minutes, once a week, per city.
//
// Auth is a PASSWORD, not a URL token: you type it once, the server sets an
// httpOnly signed cookie, and you stay logged in on that device for 30 days. A
// `?token=` in the URL would sit in browser history, in the Referer of every
// outbound link, and in any screen-share. See lib/admin-auth.js.

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
  const [authed, setAuthed] = useState(null); // null = still checking
  const [password, setPassword] = useState('');
  const [channel, setChannel] = useState('linz');
  const [data, setData] = useState(null);
  const [social, setSocial] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  // Ask the server whether this browser already holds a valid session cookie.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('channel')) setChannel(p.get('channel'));
    fetch('/api/admin/login')
      .then((r) => r.json())
      .then((j) => setAuthed(!!j.authed))
      .catch(() => setAuthed(false));
  }, []);

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
    setData(null);
  }

  const load = useCallback(async (slug) => {
    setBusy('load');
    setErr('');
    try {
      const res = await fetch(`/api/admin/digest?channel=${slug}`);
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

  const loadSocial = useCallback(async (slug) => {
    try {
      const res = await fetch(`/api/admin/social?channel=${slug}`);
      const json = await res.json();
      setSocial(res.ok ? json : { error: true });
    } catch {
      // Not a page-level error, but "buttons silently disabled" reads as a
      // broken feature — record the failure so the section can say so.
      setSocial({ error: true });
    }
  }, []);

  useEffect(() => {
    if (authed) {
      load(channel);
      loadSocial(channel);
    }
  }, [authed, channel, load, loadSocial]);

  async function act(action, extra = {}) {
    setBusy(action);
    setErr('');
    setNote('');
    try {
      const res = await fetch('/api/admin/digest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');
      if (action === 'send') {
        setNote(json.test ? `Test sent to ${json.to}` : `Sent to ${json.sent} of ${json.audience} subscribers${json.failed ? ` (${json.failed} failed)` : ''}`);
        await load(channel);
      } else {
        setData(json);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  // Shared by the bulk carousel buttons and the per-item ones below — the
  // busy key encodes WHICH row is in flight (bulk / one item / "next") so a
  // click on one row doesn't show "Posting…" on another.
  function socialBusyKey(target, extra) {
    if (extra.itemId != null) return `social-${target}-${extra.itemId}`;
    if (extra.next) return `social-${target}-next`;
    return `social-${target}`;
  }

  async function publish(target, extra = {}) {
    const busyKey = socialBusyKey(target, extra);
    setBusy(busyKey);
    setErr('');
    setNote('');
    try {
      const res = await fetch('/api/admin/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, target, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed');
      if (json.dryRun) {
        console.log(`[dry run] ${target}`, json);
        alert(json.item
          ? `Dry run — would post "${json.item.title}" to ${target}. Payload logged to console.`
          : `Dry run — would post ${json.imageUrls.length} images to ${target}. Payload logged to console.`);
      } else {
        setNote(`Posted${json.item ? ` "${json.item.title}"` : ''} to ${target}${json.permalink ? `: ${json.permalink}` : ''}${json.warning ? ` — ⚠ ${json.warning}` : ''}`);
        await loadSocial(channel);
      }
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
          <h1 style={S.h1}>Thursday desk</h1>
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
            <button type="submit" style={{ ...S.btn, width: '100%' }} disabled={busy === 'login' || !password}>
              {busy === 'login' ? 'Checking…' : 'Log in'}
            </button>
          </form>
          {err ? <p style={{ color: '#C93A5B', fontSize: 13, margin: '12px 0 0' }}>{err}</p> : null}
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
          <div style={{ ...S.row, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={S.h1}>Thursday desk</h1>
              <p style={{ ...S.muted, margin: '0 0 14px' }}>
                Weekend picks → carousel + caption + newsletter. Post manually, send when it looks right.
              </p>
            </div>
            <button style={S.ghost} onClick={logout}>Log out</button>
          </div>
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

                <div style={S.card}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>4 · Publish (Instagram + Facebook)</div>
                  {social?.error ? (
                    <div style={{ ...S.muted, fontSize: 13 }}>Publish status unavailable — reload to retry.</div>
                  ) : null}

                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Post all as one carousel</div>
                  <div style={S.row}>
                    {['instagram', 'facebook'].map((target) => {
                      const configured = social?.configured?.[target];
                      const posted = social?.posted?.[target];
                      const busyKey = socialBusyKey(target, {});
                      const label = target === 'instagram' ? 'Instagram' : 'Facebook';
                      return (
                        <div key={target} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {social && !social.error && !configured ? (
                            <span style={{ ...S.muted, fontSize: 13 }}>
                              {label}: not configured — see docs/ops/meta-api-setup.md
                            </span>
                          ) : (
                            <button
                              style={S.btn}
                              disabled={!!busy || !social || !!social.error}
                              onClick={() => {
                                // Never silently re-broadcast: confirm if the carousel
                                // already went out OR if any event was posted on its own
                                // (the carousel would repeat those). Either needs force.
                                const itemsDupe = (social.items || []).some((it) => {
                                  const p = it.posted?.[target];
                                  return p && !p.viaCarousel;
                                });
                                const needForce = !!posted || itemsDupe;
                                if (needForce) {
                                  const msg = posted
                                    ? `Already posted the ${label} carousel this weekend (${posted.permalink || posted.id}). Post again?`
                                    : `Some events were already posted individually to ${label}. Posting the carousel repeats them. Continue?`;
                                  if (!confirm(msg)) return;
                                }
                                publish(target, { force: needForce });
                              }}
                            >
                              {busy === busyKey ? 'Posting…' : posted ? `Re-post carousel → ${label}` : `Post carousel → ${label}`}
                            </button>
                          )}
                          {/* Preview is a server-side dry run — side-effect-free and
                              credential-free, so it stays available even unconfigured. */}
                          <button style={S.ghost} disabled={!!busy || !social || !!social.error} onClick={() => publish(target, { test: true })}>
                            Preview
                          </button>
                          {posted ? (
                            posted.permalink ? (
                              <a href={posted.permalink} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#2E9C8C', fontWeight: 700 }}>
                                Posted ✓
                              </a>
                            ) : (
                              <span style={{ fontSize: 13, color: '#2E9C8C', fontWeight: 700 }}>Posted ✓ (no permalink)</span>
                            )
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {social && !social.error ? (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 13, margin: '18px 0 4px' }}>Post next unposted event</div>
                      <div style={S.row}>
                        {['instagram', 'facebook'].map((target) => {
                          if (!social.configured?.[target]) return null;
                          const label = target === 'instagram' ? 'Instagram' : 'Facebook';
                          const busyKey = socialBusyKey(target, { next: true });
                          return (
                            <button
                              key={target}
                              style={S.ghost}
                              disabled={!!busy}
                              onClick={() => publish(target, { next: true })}
                            >
                              {busy === busyKey ? 'Posting…' : `Post next unposted → ${label}`}
                            </button>
                          );
                        })}
                      </div>

                      <div style={{ fontWeight: 600, fontSize: 13, margin: '18px 0 4px' }}>Post individual events</div>
                      {(social.items || []).map((it) => (
                        <div key={it.id} style={S.item}>
                          <div style={{ flex: 1 }}>
                            <a href={`/event/${it.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: '#212B28', textDecoration: 'none', fontSize: 14 }}>
                              {it.title}
                            </a>
                          </div>
                          {['instagram', 'facebook'].map((target) => {
                            const label = target === 'instagram' ? 'IG' : 'FB';
                            const targetLabel = target === 'instagram' ? 'Instagram' : 'Facebook';
                            const configured = social.configured?.[target];
                            const posted = it.posted?.[target];
                            const busyKey = socialBusyKey(target, { itemId: it.id });
                            return (
                              <div key={target} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {posted ? (
                                  <>
                                    {posted.permalink ? (
                                      <a href={posted.permalink} target="_blank" rel="noreferrer" title={posted.viaCarousel ? 'went out in the carousel' : 'posted individually'} style={{ fontSize: 12, color: '#2E9C8C', fontWeight: 700 }}>
                                        {label} ✓{posted.viaCarousel ? '↳' : ''}
                                      </a>
                                    ) : (
                                      <span title={posted.viaCarousel ? 'went out in the carousel' : 'posted individually'} style={{ fontSize: 12, color: '#2E9C8C', fontWeight: 700 }}>{label} ✓{posted.viaCarousel ? '↳' : ''}</span>
                                    )}
                                    <button
                                      style={{ ...S.ghost, padding: '3px 7px', fontSize: 11 }}
                                      disabled={!!busy}
                                      title={`Re-post "${it.title}" to ${targetLabel}`}
                                      onClick={() => {
                                        const msg = posted.viaCarousel
                                          ? `"${it.title}" already went out in the ${targetLabel} carousel this weekend. Post it on its own too?`
                                          : `Already posted "${it.title}" to ${targetLabel} (${posted.permalink || posted.id}). Post again?`;
                                        if (confirm(msg)) publish(target, { itemId: it.id, force: true });
                                      }}
                                    >
                                      ↻
                                    </button>
                                  </>
                                ) : configured ? (
                                  <button
                                    style={{ ...S.ghost, padding: '5px 10px', fontSize: 12 }}
                                    disabled={!!busy}
                                    onClick={() => publish(target, { itemId: it.id })}
                                  >
                                    {busy === busyKey ? '…' : label}
                                  </button>
                                ) : null}
                                <button
                                  style={{ ...S.ghost, padding: '5px 10px', fontSize: 12 }}
                                  disabled={!!busy}
                                  onClick={() => publish(target, { itemId: it.id, test: true })}
                                >
                                  Preview
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
