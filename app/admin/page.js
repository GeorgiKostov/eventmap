'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { S, AdminShell } from '../../lib/admin-ui.js';

// The hub George lands on — one screen linking every admin surface, plus a
// few honest at-a-glance numbers pulled from the desks' own APIs (never
// invented, never a new endpoint just for this).
const DESKS = [
  { href: '/admin/thursday', title: 'Thursday desk', desc: "This weekend's picks, cards, caption, send the newsletter." },
  { href: '/admin/highlights', title: 'Highlights desk', desc: 'Gold / editorial placement on the map.' },
  { href: '/admin/pages', title: 'Pages', desc: 'Every published weekend page + its link.' },
];

export default function AdminHub() {
  return (
    <AdminShell title="Okolo admin">
      <HubBody />
    </AdminShell>
  );
}

// A CHILD of AdminShell so its stat fetches only fire once logged in — see the
// note in app/admin/thursday/page.js.
function HubBody() {
  const [stats, setStats] = useState(null); // stays null on any fetch failure — the hub still renders its links

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/admin/pages').then((r) => r.json()),
      fetch('/api/admin/highlights').then((r) => r.json()),
    ]).then(([pagesR, highlightsR]) => {
      const pages = pagesR.status === 'fulfilled' && Array.isArray(pagesR.value?.pages) ? pagesR.value.pages : null;
      const highlights = highlightsR.status === 'fulfilled' && Array.isArray(highlightsR.value?.highlights) ? highlightsR.value.highlights : null;
      if (!pages && !highlights) return; // both failed — leave stats null, render nothing extra
      setStats({
        pageCount: pages ? pages.length : null,
        indexedCount: pages ? pages.filter((p) => p.indexed).length : null,
        activeHighlights: highlights ? highlights.filter((h) => h.active).length : null,
      });
    });
  }, []);

  return (
    <>
      {stats ? (
        <div style={S.card}>
          <div style={S.row}>
            <Stat label="published pages" value={stats.pageCount} />
            <Stat label="indexed" value={stats.indexedCount} />
            <Stat label="active highlights" value={stats.activeHighlights} />
          </div>
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {DESKS.map((d) => (
          <Link key={d.href} href={d.href} style={{ ...S.card, display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{d.title}</div>
            <div style={S.muted}>{d.desc}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value }) {
  if (value == null) return null;
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
      <div style={S.muted}>{label}</div>
    </div>
  );
}
