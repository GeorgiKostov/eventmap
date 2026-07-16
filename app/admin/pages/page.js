'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHANNELS } from '../../../lib/city-channels.js';
import { S, AdminShell, formatVienna } from '../../../lib/admin-ui.js';

// George: "a view of all published blog/newsletter based pages so I can review
// and copy their links — eg when we make a newsletter we also create a new
// page that google can SEO and crawl". Every row here is one frozen weekly
// digest snapshot (lib/digest.js) — the same one the newsletter/carousel/
// social post already read — rendered as a public, indexable page at
// /weekend/<city>/<friday> (app/weekend/[city]/[weekend]/page.js).
export default function PagesPage() {
  return (
    <AdminShell title="Pages" subtitle="Every published weekend page — copy a link, check what's indexed, sent, or posted.">
      <PagesDesk />
    </AdminShell>
  );
}

// A CHILD of AdminShell so the list only loads once logged in — see the note in
// app/admin/thursday/page.js.
function PagesDesk() {
  const [pages, setPages] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(''); // which url was just copied, for the "Copied ✓" flash

  const load = useCallback(async () => {
    setErr('');
    try {
      const res = await fetch('/api/admin/pages');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'failed to load');
      setPages(json.pages);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Copying the link IS this desk's job, so a blocked clipboard (insecure
  // context, denied permission) must say so rather than leave a dead button —
  // the url goes in the error line so it stays hand-copyable either way.
  function copy(url) {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(url);
        setTimeout(() => setCopied((c) => (c === url ? '' : c)), 1500);
      },
      () => setErr(`Clipboard blocked by the browser — copy it by hand: ${url}`),
    );
  }

  // Group by city, Linz-first (CHANNELS' own rollout order), newest weekend
  // first within each city. Any slug that isn't a current channel (a retired
  // city, in principle) still gets its own group at the end rather than being
  // dropped — an orphaned page is exactly the kind of thing this desk exists
  // to surface.
  const groups = [];
  if (pages) {
    const bySlug = new Map();
    for (const p of pages) {
      if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
      bySlug.get(p.slug).push(p);
    }
    for (const c of CHANNELS) {
      if (bySlug.has(c.slug)) groups.push({ slug: c.slug, city: c.label, rows: bySlug.get(c.slug) });
    }
    for (const [slug, rows] of bySlug) {
      if (!CHANNELS.some((c) => c.slug === slug)) groups.push({ slug, city: rows[0]?.city || slug, rows });
    }
    for (const g of groups) g.rows.sort((a, b) => (a.friday < b.friday ? 1 : -1));
  }

  return (
    <>
      {err ? (
        <div style={{ ...S.card, borderLeft: '4px solid #C93A5B' }}>
          <strong>Error:</strong> {err}
        </div>
      ) : null}

      {pages === null && !err ? <div style={S.card}>Loading…</div> : null}

      {pages && !pages.length ? (
        <div style={S.card}>
          <p style={S.muted}>
            No pages yet — a page appears here once a digest is built on the{' '}
            <a href="/admin/thursday" style={{ color: '#C93A5B', fontWeight: 700 }}>Thursday desk</a>.
          </p>
        </div>
      ) : null}

      {groups.map((g) => (
        <div key={g.slug} style={S.card}>
          <div style={{ ...S.row, justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{g.city}</div>
            <CopyLink url={`${g.rows[0]?.cityUrl}`} copied={copied} onCopy={copy} label="Copy stable link" />
          </div>
          <p style={{ ...S.muted, margin: '2px 0 14px' }}>
            The stable link always redirects to this week — use it for a bio, a QR code, or a pinned group message.
          </p>

          {g.rows.map((p) => (
            <div key={p.friday} style={{ ...S.item, flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ ...S.row, justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {p.label} <span style={{ ...S.muted, fontWeight: 400 }}>({p.friday}){p.isCurrent ? ' · current weekend' : ''}</span>
                  </div>
                  <div style={S.muted}>{p.itemCount} pick{p.itemCount === 1 ? '' : 's'}{p.subject ? ` · "${p.subject}"` : ''}</div>
                </div>
                <div style={{ ...S.row, gap: 6 }}>
                  <CopyLink url={p.url} copied={copied} onCopy={copy} label="Copy link" />
                  <a href={p.url} target="_blank" rel="noopener" style={S.ghost}>Open ↗</a>
                </div>
              </div>

              <div style={{ ...S.row, gap: 8 }}>
                <span style={{ ...S.chip, ...(p.indexed ? S.chipPosted : { color: '#E59500', background: '#FBF2DE' }) }}>
                  {p.indexed ? 'Indexed' : 'Noindex (thin — under 3 picks)'}
                </span>
                <span style={{ ...S.chip, ...(p.sentAt ? S.chipPosted : { color: '#6D7876', background: '#F0F0EC' }) }} title={p.sentAt ? formatVienna(p.sentAt) : ''}>
                  {p.sentAt ? `Sent ${formatVienna(p.sentAt)}` : 'Not sent'}
                </span>
                {p.postedIg ? <span style={{ ...S.chip, ...S.chipPosted }}>IG ✓ posted</span> : null}
                {p.postedFb ? <span style={{ ...S.chip, ...S.chipPosted }}>FB ✓ posted</span> : null}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function CopyLink({ url, copied, onCopy, label }) {
  if (!url) return null;
  return (
    <button style={{ ...S.ghost, padding: '6px 10px', fontSize: 12 }} onClick={() => onCopy(url)}>
      {copied === url ? 'Copied ✓' : label}
    </button>
  );
}
