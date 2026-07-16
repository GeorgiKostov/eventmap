'use client';

import { useCallback, useEffect, useState } from 'react';
import { CATS } from '../../../lib/icons.js';
import { S, AdminShell, formatVienna } from '../../../lib/admin-ui.js';

// The Thursday desk (docs/ops/weekly-automation.md §3). Everything George needs
// for the weekly growth motion on one screen: this weekend's picks, the 6
// carousel cards to download, the caption to paste, the email preview, and the
// send button. ~10 minutes, once a week, per city.
//
// Auth/nav/logout chrome lives in AdminShell (lib/admin-ui.js) — this page
// only owns what's below that: channel picker, previews, publish buttons,
// ledgers.

const TIER_LABEL = {
  2: { label: 'official+', style: { background: '#FBEEF1', color: '#C93A5B' } },
  1: { label: 'official', style: { background: '#F0F0EC', color: '#6D7876' } },
  0: { label: 'community', style: { background: 'transparent', color: '#E59500', border: '1px dashed #E59500' } },
};

// Defensive: only new digest snapshots carry source/tier. Absent on either → render nothing.
function SourceLine({ source, tier }) {
  if (source == null && tier == null) return null;
  const t = TIER_LABEL[tier];
  return (
    <div style={{ ...S.muted, fontSize: 11, margin: '2px 0 0' }}>
      {source || null}
      {t ? <span style={{ ...S.tierChip, ...t.style }}>{t.label}</span> : null}
    </div>
  );
}

// The desk body must be a CHILD of AdminShell, never the component that renders
// it: React runs a parent's effects regardless of what that parent returns, so
// holding the desk's state here would fire every load while still logged out
// (one 403 each) and — since `authed` lives inside the shell — never re-fire on
// login, leaving a freshly-logged-in desk empty. As a child it mounts the moment
// the shell confirms the session, and mounting is exactly what runs the loads.
export default function ThursdayPage() {
  return (
    <AdminShell title="Thursday desk" subtitle="Weekend picks → carousel + caption + newsletter. Post manually, send when it looks right.">
      <ThursdayDesk />
    </AdminShell>
  );
}

function ThursdayDesk() {
  const [channel, setChannel] = useState('linz');
  const [data, setData] = useState(null);
  const [social, setSocial] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  // Inline preview panel state (replaces the old alert()/console.log preview).
  // { kind: 'bulk'|'item', target, images: [url,...], caption, title }
  const [preview, setPreview] = useState(null);

  // Mounted only once logged in (see ThursdayPage), so this only needs the
  // ?channel= deep link, not an auth check.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('channel')) setChannel(p.get('channel'));
  }, []);

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
    load(channel);
    loadSocial(channel);
    setPreview(null); // stale card/caption from another channel would mislead
  }, [channel, load, loadSocial]);

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
        setPreview({
          kind: json.item ? 'item' : 'bulk',
          target,
          images: json.imageUrls,
          caption: json.caption,
          title: json.item?.title || null,
        });
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

  // Cards need no token: they're our own marketing art, and a public URL is
  // what an Instagram/Facebook Graph API post would have to fetch later anyway.
  const cardUrl = (path) => path;

  return (
    <>
        <div style={S.card}>
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
                  <div style={{ ...S.row, justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 700 }}>4 · Publish (Instagram + Facebook)</div>
                    <button style={{ ...S.ghost, padding: '6px 10px', fontSize: 12 }} disabled={!!busy} onClick={() => loadSocial(channel)}>
                      ↻ refresh status
                    </button>
                  </div>
                  {social?.error ? (
                    <div style={{ ...S.muted, fontSize: 13, marginTop: 8 }}>Publish status unavailable — reload to retry.</div>
                  ) : null}

                  {preview ? (
                    <div style={S.previewPanel}>
                      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          Preview — {preview.target === 'instagram' ? 'Instagram' : 'Facebook'}
                          {preview.title ? `: ${preview.title}` : ' (carousel, all picks)'}
                        </div>
                        <button style={{ ...S.ghost, padding: '5px 10px', fontSize: 12 }} onClick={() => setPreview(null)}>
                          Close
                        </button>
                      </div>
                      {preview.kind === 'bulk' ? (
                        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 10 }}>
                          {preview.images.map((src, i) => (
                            <img
                              key={src}
                              src={src}
                              alt={`slide ${i}`}
                              loading="lazy"
                              style={{ height: 220, width: 'auto', borderRadius: 8, border: '1px solid #DCDCD6', background: '#fff' }}
                            />
                          ))}
                        </div>
                      ) : (
                        <img
                          src={preview.images[0]}
                          alt={preview.title || 'card'}
                          loading="lazy"
                          style={{ maxHeight: 360, borderRadius: 8, border: '1px solid #DCDCD6', background: '#fff', display: 'block', marginBottom: 10 }}
                        />
                      )}
                      <pre style={{ ...S.pre, userSelect: 'text' }}>{preview.caption}</pre>
                    </div>
                  ) : null}

                  <div style={S.subhead}>Carousel (all picks)</div>
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
                              <a href={posted.permalink} target="_blank" rel="noreferrer" title={formatVienna(posted.at)} style={{ ...S.chip, ...S.chipPosted }}>
                                ✓ posted
                              </a>
                            ) : (
                              <span title={formatVienna(posted.at)} style={{ ...S.chip, ...S.chipPosted }}>✓ posted (no permalink)</span>
                            )
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {social && !social.error ? (
                    <>
                      <div style={{ ...S.row, justifyContent: 'space-between' }}>
                        <div style={S.subhead}>Individual posts</div>
                        <div style={{ ...S.row, gap: 6 }}>
                          {['instagram', 'facebook'].map((target) => {
                            if (!social.configured?.[target]) return null;
                            const label = target === 'instagram' ? 'IG' : 'FB';
                            const busyKey = socialBusyKey(target, { next: true });
                            return (
                              <button
                                key={target}
                                style={{ ...S.ghost, padding: '6px 10px', fontSize: 12 }}
                                disabled={!!busy}
                                onClick={() => publish(target, { next: true })}
                              >
                                {busy === busyKey ? 'Posting…' : `Post next unposted → ${label}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {(social.items || []).map((it) => {
                        const doneBoth = !!(it.posted?.instagram && it.posted?.facebook);
                        const cardSrc = social.weekend
                          ? `/api/social/card?channel=${channel}&event=${it.id}&weekend=${social.weekend}`
                          : null;
                        return (
                          <div key={it.id} style={{ ...S.item, opacity: doneBoth ? 0.55 : 1 }}>
                            {cardSrc ? (
                              <a href={cardSrc} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                                <img src={cardSrc} alt={`card for ${it.title}`} loading="lazy" style={S.thumb} />
                              </a>
                            ) : null}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div>
                                <span style={S.dot(CATS[it.cat]?.color)} />
                                <a href={`/event/${it.id}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: '#212B28', textDecoration: 'none', fontSize: 14 }}>
                                  {it.title}
                                </a>
                              </div>
                              <SourceLine source={it.source} tier={it.tier} />
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
                                        <a
                                          href={posted.permalink}
                                          target="_blank"
                                          rel="noreferrer"
                                          title={`${posted.viaCarousel ? 'went out in the carousel' : 'posted individually'} · ${formatVienna(posted.at)}`}
                                          style={{ ...S.chip, ...(posted.viaCarousel ? S.chipCarousel : S.chipPosted) }}
                                        >
                                          {label} {posted.viaCarousel ? '✓ carousel' : '✓ posted'}
                                        </a>
                                      ) : (
                                        <span
                                          title={`${posted.viaCarousel ? 'went out in the carousel' : 'posted individually'} · ${formatVienna(posted.at)}`}
                                          style={{ ...S.chip, ...(posted.viaCarousel ? S.chipCarousel : S.chipPosted) }}
                                        >
                                          {label} {posted.viaCarousel ? '✓ carousel' : '✓ posted'}
                                        </span>
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
                        );
                      })}
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </>
        ) : null}
    </>
  );
}
