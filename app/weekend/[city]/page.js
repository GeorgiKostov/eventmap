import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getChannel, weekendWindow, weekendLabel } from '../../../lib/city-channels.js';
import { loadDigestFor } from '../../../lib/digest.js';
import { listDigestKeys } from '../../../lib/db.js';

// /weekend/<city> — the stable link. It always shows the CURRENT weekend, so this
// is the URL to put in a bio, a poster QR, or a group message: it never goes
// stale. If this week's digest isn't prepared yet, it falls back to the archive
// rather than 404ing on a Monday.
export const dynamic = 'force-dynamic';

const COPY = {
  de: { archive: 'Frühere Wochenenden', none: 'Das Wochenende wird gerade zusammengestellt — schau später nochmal vorbei.', back: 'Zur Karte' },
  bg: { archive: 'Предишни уикенди', none: 'Този уикенд се подготвя — намини по-късно.', back: 'Към картата' },
  en: { archive: 'Earlier weekends', none: 'This weekend is still being put together — check back shortly.', back: 'To the map' },
};

export async function generateMetadata({ params }) {
  const { city } = await params;
  const channel = getChannel(city);
  if (!channel) return {};
  // Own title + canonical: without these the archive fallback inherits the
  // homepage's metadata from the root layout, canonical '/' included.
  return {
    title: channel.label,
    alternates: { canonical: `/weekend/${channel.slug}` },
  };
}

export default async function CityWeekendIndex({ params }) {
  const { city } = await params;
  const channel = getChannel(city);
  if (!channel) notFound();

  const { friday } = weekendWindow(channel.tz);
  const current = await loadDigestFor(channel, friday);
  if (current) redirect(`/weekend/${channel.slug}/${friday}`);

  // No digest for this weekend yet — show the archive instead of a dead end.
  const c = COPY[channel.lang] || COPY.en;
  const past = (await listDigestKeys()).filter((k) => k.slug === channel.slug);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px', fontFamily: 'system-ui, sans-serif', color: '#212B28' }}>
      <h1 style={{ fontSize: 26 }}>{channel.label}</h1>
      <p style={{ color: '#4A5652' }}>{c.none}</p>
      {past.length ? (
        <>
          <h2 style={{ fontSize: 18, marginTop: 28 }}>{c.archive}</h2>
          <ul style={{ paddingLeft: 18, lineHeight: 2 }}>
            {past.map(({ friday: f }) => (
              <li key={f}>
                <Link href={`/weekend/${channel.slug}/${f}`} style={{ color: '#C93A5B' }}>
                  {weekendLabel({ friday: f, sunday: f }, channel.lang)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p style={{ marginTop: 28 }}>
        <Link href="/" style={{ color: '#C93A5B', fontWeight: 700 }}>{c.back} →</Link>
      </p>
    </main>
  );
}
