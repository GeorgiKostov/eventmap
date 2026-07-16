import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getChannel, weekendWindow } from '../../../../lib/city-channels.js';
import { loadDigestFor, MIN_INDEXABLE_ITEMS, sectionsOf } from '../../../../lib/digest.js';
import { eventsByIds } from '../../../../lib/db.js';
import { CATS } from '../../../../lib/icons.js';
import { STRINGS } from '../../../../lib/i18n.js';
import NewsletterSignup from '../../../newsletter-signup.js';

// Highlight ring colours — same two as the map pins (app/page.js
// HIGHLIGHT_COLORS) and the newsletter (lib/digest.js HIGHLIGHT).
const HIGHLIGHT = { gold: '#E8A800', editorial: '#C93A5B' };

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
    // The issue carries two strands now (lib/digest.js SECTIONS), so the page
    // title covers the weekend rather than promising only families — the family
    // promise lives on its own section heading below. This also matches the
    // query people actually type ("was ist los in linz am wochenende"), which
    // was never family-specific.
    h1: (city, label) => `Was ist los in ${city}? Wochenende ${label}`,
    lede: (city, n) => `${n} Ideen rund um ${city} — für Familien und für alle, von Festen und Kinderprogramm bis Kunst, Musik und Ausflügen. Jede Woche neu, aus offiziellen Quellen.`,
    free: 'gratis',
    mapCta: 'Alle Events auf der Karte ansehen',
    mapSub: (city) => `Über 20.000 Veranstaltungen in ganz Österreich — alles rund um ${city} auf einer Karte.`,
    nlCta: 'Diese Tipps jede Woche per E-Mail',
    archive: 'Frühere Wochenenden',
    source: 'Details & Quelle',
    past: 'Dieses Wochenende ist vorbei — hier sind die Tipps für dieses Wochenende.',
    thisWeekend: 'Zum aktuellen Wochenende',
    empty: 'Für dieses Wochenende haben wir nichts gefunden.',
  },
  bg: {
    locale: 'bg-BG',
    h1: (city, label) => `Какво се случва в ${city}? Уикенд ${label}`,
    lede: (city, n) => `${n} идеи около ${city} — за семейства и за всички: фестивали, детско кино, изкуство, музика и разходки. Всяка седмица нови, от официални източници.`,
    free: 'безплатно',
    mapCta: 'Виж всички събития на картата',
    mapSub: (city) => `Хиляди събития около ${city} на една карта.`,
    nlCta: 'Получавай тези идеи всяка седмица по имейл',
    archive: 'Предишни уикенди',
    source: 'Детайли и източник',
    past: 'Този уикенд отмина — виж идеите за текущия.',
    thisWeekend: 'Към текущия уикенд',
    empty: 'Не намерихме нищо за този уикенд.',
  },
  en: {
    locale: 'en-GB',
    h1: (city, label) => `What's on in ${city}? Weekend ${label}`,
    lede: (city, n) => `${n} ideas around ${city} — for families and for everyone, from festivals and kids' cinema to art, music and days out. New every week, from official sources.`,
    free: 'free',
    mapCta: 'See every event on the map',
    mapSub: (city) => `Thousands of events around ${city} on one map.`,
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
    robots: digest.items.length >= MIN_INDEXABLE_ITEMS ? undefined : { index: false, follow: true },
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
  // Same grouping as the mail and the caption (one definition in lib/digest.js),
  // so the three surfaces can never disagree about which strand a pick is in.
  // `n` numbers picks 1..N across the whole issue, not per section.
  const groups = sectionsOf(items, channel.lang);
  let n = 0;

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 72px', fontFamily: 'system-ui, sans-serif', color: '#212B28' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(channel, digest, items)) }} />

      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 20, color: '#212B28', textDecoration: 'none' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#C93A5B" fillRule="evenodd" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
        </svg>
        <span>okolo<span style={{ color: '#C93A5B' }}>{channel.handle.replace(/^okolo/, '')}</span></span>
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

      {groups.map((g) => (
        <section key={g.key || 'flat'}>
          {/* A real heading, not a styled div: "Für Familien" is a meaningful
              landmark for readers and for Google. Event titles drop to h3 under
              it so the outline stays h1 → h2 → h3; a pre-sections frozen
              snapshot has no heading and keeps its titles at h2. */}
          {g.title && (
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#4A5652', margin: '30px 0 -4px' }}>
              {g.title}
            </h2>
          )}
          <ol style={{ listStyle: 'none', padding: 0, margin: '28px 0 0' }}>
            {g.items.map((it) => {
          const i = n++;
          const Title = g.title ? 'h3' : 'h2';
          const color = CATS[it.cat]?.color || '#C93A5B';
          // Frozen snapshots predate `highlight`, so it may simply be absent —
          // no treatment and no label then, which is the honest pairing (an
          // unbadged, unstyled row is just an organic pick, and highlights never
          // reorder this list anyway — see weekendPicks).
          const hl = HIGHLIGHT[it.highlight] || null;
          const body = (
            <>
              <Title style={{ fontSize: 19, margin: '0 0 4px', lineHeight: 1.3 }}>
                {it.title}
                {/* Gold (paid) only — legal disclosure travels with the styling. */}
                {it.highlight === 'gold' && (
                  <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 10, fontWeight: 800, color: '#212B28', background: '#FDF3DA', border: `1px solid ${HIGHLIGHT.gold}`, borderRadius: 99, padding: '3px 8px', verticalAlign: 'middle' }}>
                    {(STRINGS[channel.lang] || STRINGS.en).adTag}
                  </span>
                )}
              </Title>
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
            <li key={it.id} style={{ display: 'flex', gap: 14, background: '#fff', border: hl ? `2px solid ${hl}` : '1px solid #E4E4DD', borderLeft: `5px solid ${color}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
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
        </section>
      ))}

      <section style={{ background: '#fff', border: '1px solid #E4E4DD', borderRadius: 14, padding: 20, marginTop: 26 }}>
        <a href={mapUrl} style={{ display: 'inline-block', background: '#C93A5B', color: '#fff', fontWeight: 700, textDecoration: 'none', borderRadius: 10, padding: '13px 20px' }}>
          {c.mapCta} →
        </a>
        <p style={{ color: '#4A5652', fontSize: 14, margin: '12px 0 0' }}>{c.mapSub(channel.label)}</p>
      </section>

      {/* The conversion point. This page is the SEO surface — someone arrives on
          "was ist los in Linz am Wochenende", reads the picks, and this is where
          they can say "yes, weekly". The area is the channel this page is already
          about, so it costs one field. (`c.nlCta` has existed unused since the
          page shipped — this is the section it was written for.) */}
      <NewsletterSignup
        lang={channel.lang}
        area={{ label: channel.label, lat: channel.lat, lng: channel.lng }}
        source="weekend_page"
        title={c.nlCta}
      />

      <p style={{ marginTop: 28, fontSize: 14 }}>
        <Link href={`/weekend/${channel.slug}`} style={{ color: '#C93A5B', fontWeight: 700 }}>{c.archive} →</Link>
      </p>
    </main>
  );
}
