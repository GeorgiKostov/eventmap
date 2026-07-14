import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getChannel, weekendWindow } from '../../../../lib/city-channels.js';
import { loadDigestFor } from '../../../../lib/digest.js';
import { eventsByIds } from '../../../../lib/db.js';
import { CATS } from '../../../../lib/icons.js';

// The weekly digest, as a permanent public page. Phase 2 of the newsletter
// (George: "a sharable page per city per week so we reuse the content and have
// a nice SEO output").
//
// It costs nothing extra to produce: the frozen snapshot the newsletter and the
// carousel already read IS this page. Three jobs:
//   1. A LINK to paste into WhatsApp/Facebook groups — a real page unfurls with
//      the carousel cover, where a bare map link shows nothing.
//   2. An INDEXABLE page for the query parents actually type ("was ist los in
//      Linz am Wochenende"). Real events, our own words, refreshed weekly.
//   3. An ARCHIVE. Past weekends stay up, keep their links, and keep ranking.
//
// Rendered server-side, no client JS. Facts + linkback (hard rule 1): every event
// links to our own event page, which carries the source_url.
export const dynamic = 'force-dynamic';

const COPY = {
  de: {
    locale: 'de-AT',
    h1: (city, label) => `Was ist los in ${city}? Familien-Wochenende ${label}`,
    lede: (city, n) => `${n} Ideen für Familien rund um ${city} — Feste, Kinderkino, Sport und Ausflüge. Jede Woche neu, aus offiziellen Quellen.`,
    free: 'gratis',
    mapCta: 'Alle Events auf der Karte ansehen',
    mapSub: (city) => `Über 20.000 Veranstaltungen in ganz Österreich — gefiltert auf Familien rund um ${city}.`,
    nlCta: 'Diese Tipps jede Woche per E-Mail',
    archive: 'Frühere Wochenenden',
    source: 'Details & Quelle',
    past: 'Dieses Wochenende ist vorbei — hier sind die Tipps für dieses Wochenende.',
    thisWeekend: 'Zum aktuellen Wochenende',
    empty: 'Für dieses Wochenende haben wir nichts gefunden.',
  },
  bg: {
    locale: 'bg-BG',
    h1: (city, label) => `Какво се случва в ${city}? Семеен уикенд ${label}`,
    lede: (city, n) => `${n} идеи за семейства около ${city} — фестивали, детско кино, спорт и разходки. Всяка седмица нови, от официални източници.`,
    free: 'безплатно',
    mapCta: 'Виж всички събития на картата',
    mapSub: (city) => `Хиляди събития — филтрирани за семейства около ${city}.`,
    nlCta: 'Получавай тези идеи всяка седмица по имейл',
    archive: 'Предишни уикенди',
    source: 'Детайли и източник',
    past: 'Този уикенд отмина — виж идеите за текущия.',
    thisWeekend: 'Към текущия уикенд',
    empty: 'Не намерихме нищо за този уикенд.',
  },
  en: {
    locale: 'en-GB',
    h1: (city, label) => `What's on in ${city}? Family weekend ${label}`,
    lede: (city, n) => `${n} ideas for families around ${city} — festivals, kids' cinema, sport and days out. New every week, from official sources.`,
    free: 'free',
    mapCta: 'See every event on the map',
    mapSub: (city) => `Thousands of events — filtered to families around ${city}.`,
    nlCta: 'Get these by email every week',
    archive: 'Earlier weekends',
    source: 'Details & source',
    past: 'This weekend is over — here are this week’s picks.',
    thisWeekend: 'Go to this weekend',
    empty: 'We found nothing for this weekend.',
  },
};

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');

async function load(params) {
  const { city, weekend } = await params;
  const channel = getChannel(city);
  if (!channel) return null;
  const digest = await loadDigestFor(channel, weekend);
  if (!digest) return null;
  return { channel, digest, weekend, c: COPY[channel.lang] || COPY.en };
}

export async function generateMetadata({ params }) {
  const data = await load(params);
  if (!data) return { title: 'Okolo' };
  const { channel, digest, weekend, c } = data;
  const title = c.h1(channel.label, digest.label);
  const description = c.lede(channel.label, digest.items.length);
  const url = `${BASE}/weekend/${channel.slug}/${weekend}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // A thin page is worse than no page: if the weekend produced almost nothing,
    // keep it reachable by link but out of the index — a stack of near-empty
    // city pages is exactly what Google treats as a doorway farm.
    robots: digest.items.length >= 3 ? undefined : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      locale: c.locale,
      // The carousel cover doubles as the unfurl image — so pasting this link
      // into a WhatsApp group shows the same card that goes on Instagram.
      images: [{ url: `${BASE}/api/social/card?channel=${channel.slug}&weekend=${weekend}&slide=0`, width: 1080, height: 1350 }],
    },
  };
}

// schema.org Event list — this is what Google and the AI assistants ingest. The
// facts are ours (title/date/place); the descriptions are our own words.
//
// An Event without `startDate` is INVALID schema.org, and Google rejects the
// whole rich result rather than the one bad item. Snapshots frozen before the
// raw dates were stored (and any future gap) simply don't get a JSON-LD entry —
// they still render on the page. Emitting a broken Event is worse than emitting
// one fewer.
function jsonLd(channel, digest, items) {
  const datedItems = items.filter((it) => it.startsAt);
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: COPY[channel.lang]?.h1(channel.label, digest.label) || digest.subject,
    itemListElement: datedItems.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Event',
        name: it.title,
        startDate: it.startsAt,
        endDate: it.endsAt || undefined,
        description: it.teaser || undefined,
        url: `${BASE}/event/${it.id}`,
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        eventStatus: 'https://schema.org/EventScheduled',
        location: {
          '@type': 'Place',
          name: it.venue || it.town || channel.label,
          address: { '@type': 'PostalAddress', addressLocality: it.town || channel.label, addressCountry: channel.country },
        },
        ...(it.isFree ? { offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } } : {}),
      },
    })),
  };
}

export default async function WeekendPage({ params }) {
  const data = await load(params);
  if (!data) notFound();
  const { channel, digest, weekend, c } = data;

  // A past weekend's events are 'expired', so /event/<id> 404s for them. Link
  // only the ones still live; the rest render as plain text. A page full of
  // links to 404s is worse for SEO than a page with fewer links.
  const live = new Set((await eventsByIds(digest.items.map((i) => i.id))).map((e) => String(e.id)));

  const items = digest.items.map((it) => ({
    ...it,
    isFree: it.badges.includes(c.free),
    startsAt: it.startsAt || undefined,
    linked: live.has(String(it.id)),
  }));

  const isPast = weekend < weekendWindow(channel.tz).friday;
  const mapUrl = `${BASE}/?lat=${channel.lat}&lng=${channel.lng}&utm_source=okolo&utm_medium=weekend_page&utm_campaign=weekend-${weekend}`;

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 72px', fontFamily: 'system-ui, sans-serif', color: '#212B28' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(channel, digest, items)) }} />

      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 20, color: '#212B28', textDecoration: 'none' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#C93A5B" fillRule="evenodd" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
        </svg>
        okolo
      </Link>

      <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: '22px 0 10px', letterSpacing: -0.4 }}>{c.h1(channel.label, digest.label)}</h1>
      <p style={{ color: '#4A5652', fontSize: 17, lineHeight: 1.6, margin: '0 0 8px' }}>{digest.intro}</p>

      {isPast && (
        <p style={{ background: '#FBEEF1', color: '#212B28', borderRadius: 10, padding: '12px 14px', fontSize: 14, margin: '18px 0 0' }}>
          {c.past}{' '}
          <Link href={`/weekend/${channel.slug}`} style={{ color: '#C93A5B', fontWeight: 700 }}>{c.thisWeekend} →</Link>
        </p>
      )}

      {!items.length && <p style={{ color: '#4A5652' }}>{c.empty}</p>}

      <ol style={{ listStyle: 'none', padding: 0, margin: '28px 0 0' }}>
        {items.map((it, i) => {
          const color = CATS[it.cat]?.color || '#C93A5B';
          const body = (
            <>
              <h2 style={{ fontSize: 19, margin: '0 0 4px', lineHeight: 1.3 }}>{it.title}</h2>
              <div style={{ color, fontWeight: 700, fontSize: 14 }}>
                {it.when}
                {it.venue ? <span style={{ color: '#4A5652', fontWeight: 400 }}> · {it.venue}</span> : null}
              </div>
              {it.teaser ? <p style={{ color: '#4A5652', fontSize: 15, lineHeight: 1.55, margin: '7px 0 0' }}>{it.teaser}</p> : null}
              {it.badges.length ? (
                <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {it.badges.map((b) => (
                    <span key={b} style={{ background: color, color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '5px 9px' }}>{b}</span>
                  ))}
                </div>
              ) : null}
            </>
          );
          return (
            <li key={it.id} style={{ display: 'flex', gap: 14, background: '#fff', border: '1px solid #E4E4DD', borderLeft: `5px solid ${color}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
              <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 99, background: color, color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                {it.linked ? (
                  <Link href={`/event/${it.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{body}</Link>
                ) : (
                  body
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <section style={{ background: '#fff', border: '1px solid #E4E4DD', borderRadius: 14, padding: 20, marginTop: 26 }}>
        <a href={mapUrl} style={{ display: 'inline-block', background: '#C93A5B', color: '#fff', fontWeight: 700, textDecoration: 'none', borderRadius: 10, padding: '13px 20px' }}>
          {c.mapCta} →
        </a>
        <p style={{ color: '#4A5652', fontSize: 14, margin: '12px 0 0' }}>{c.mapSub(channel.label)}</p>
      </section>

      <p style={{ marginTop: 28, fontSize: 14 }}>
        <Link href={`/weekend/${channel.slug}`} style={{ color: '#C93A5B', fontWeight: 700 }}>{c.archive} →</Link>
      </p>
    </main>
  );
}
