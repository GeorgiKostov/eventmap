import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getEventLanding, nearbyUpcomingEvents } from '../../../lib/db.js';
import { validDateOf, validTimeOf } from '../../../lib/event-time.js';
import { channelForPoint } from '../../../lib/city-channels.js';
import { eventDescription, eventJsonLd } from '../../../lib/event-jsonld.js';
import { STRINGS } from '../../../lib/i18n.js';
import NewsletterSignup from '../../newsletter-signup.js';

export const dynamic = 'force-dynamic';

// Highlight ring colours — same two as the map pins (app/page.js
// HIGHLIGHT_COLORS) and the newsletter (lib/digest.js HIGHLIGHT). This page is
// inline-styled like its siblings, so the hex is restated rather than tokenized.
const HIGHLIGHT = { gold: '#E8A800', editorial: '#C93A5B' };

const PAGE_COPY = {
  de: { locale: 'de-AT', notFound: 'Event nicht gefunden', inTown: 'in', onDate: 'am', allDay: 'ganztägig', timeTbd: 'Uhrzeit nicht angegeben', clock: 'Uhr', free: 'Eintritt frei', source: 'Quelle', upload: 'Foto-Upload', map: 'Auf der Karte ansehen →', archiveMap: 'Kommende Events auf der Karte ansehen →', back: 'Zurück zur Karte', past: 'Diese Veranstaltung ist vorbei', pastNote: 'Die Seite bleibt als Archiv erhalten. Entdecke, was als Nächstes in der Nähe passiert.', nearby: 'Demnächst in der Nähe', away: 'km entfernt' },
  en: { locale: 'en-GB', notFound: 'Event not found', inTown: 'in', onDate: 'on', allDay: 'all day', timeTbd: 'time not stated', clock: '', free: 'Free entry', source: 'Source', upload: 'Photo upload', map: 'View on the map →', archiveMap: 'See upcoming events on the map →', back: 'Back to the map', past: 'This event has ended', pastNote: 'This page remains as an archive. Discover what is coming up nearby.', nearby: 'Coming up nearby', away: 'km away' },
  bg: { locale: 'bg-BG', notFound: 'Събитието не е намерено', inTown: 'в', onDate: 'на', allDay: 'целодневно', timeTbd: 'часът не е посочен', clock: 'ч.', free: 'Безплатен вход', source: 'Източник', upload: 'Качена снимка', map: 'Виж на картата →', archiveMap: 'Виж предстоящите събития на картата →', back: 'Обратно към картата', past: 'Това събитие приключи', pastNote: 'Страницата остава като архив. Открий какво предстои наблизо.', nearby: 'Предстоящи събития наблизо', away: 'км разстояние' },
};

async function pageCopy() {
  const lang = await pageLang();
  return PAGE_COPY[lang] || PAGE_COPY.en;
}

async function pageLang() {
  const lang = (await headers()).get('x-okolo-lang');
  return PAGE_COPY[lang] ? lang : 'en';
}

function formatEventDate(value, locale, options) {
  const date = validDateOf(value);
  if (!date) return null;
  return new Intl.DateTimeFormat(locale, options).format(new Date(`${date}T12:00`));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ev = await getEventLanding(id);
  const t = await pageCopy();
  if (!ev) return { title: `${t.notFound} — Okolo` };
  const isArchived = ev.status === 'expired';
  const when = validDateOf(ev.starts_at);
  // The city handle brands the tab/search result too, not just the page header —
  // same reason as the header (George: "it just says okolo instead of okolo.linz").
  const channel = ev.lat != null && ev.lng != null ? channelForPoint(ev.lat, ev.lng) : null;
  const brand = channel?.handle || 'Okolo';
  return {
    // `absolute` bypasses the root layout's `template: '%s · Okolo'`. Without it
    // this page's own "· Okolo" suffix got the template appended on top and every
    // event tab read "… · Okolo · Okolo" (live bug, visible in the browser).
    title: { absolute: when ? `${ev.title} — ${when} · ${brand}` : `${ev.title} · ${brand}` },
    description: ev.description || `${ev.title}${ev.town ? ` ${t.inTown} ${ev.town}` : ''}${when ? ` ${t.onDate} ${when}.` : '.'}`,
    // Override the root layout's canonical '/': without this every event page
    // declares itself a duplicate of the homepage and Google drops it.
    alternates: { canonical: `/event/${id}` },
    ...((isArchived || !when) ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: ev.title,
      description: eventDescription(ev),
      images: [{ url: `/event/${id}/opengraph-image`, width: 1200, height: 675 }],
      type: 'article',
      locale: t.locale.replace('-', '_'),
    },
  };
}

export default async function EventPage({ params }) {
  const { id } = await params;
  const ev = await getEventLanding(id);
  if (!ev) notFound();
  const t = await pageCopy();
  const lang = await pageLang();
  const isArchived = ev.status === 'expired';
  const nearby = isArchived
    ? await nearbyUpcomingEvents({ lat: ev.lat, lng: ev.lng, excludeId: ev.id, categories: ev.categories })
    : [];

  // Which city this event belongs to, from its own coordinates. George: the page
  // "just says okolo instead of okolo.linz or wherever you came from". Deriving
  // the channel from the EVENT (not from a referrer or a query param) means the
  // branding is right however the reader arrived — Google, a pasted link, the
  // newsletter — and it can't be spoofed into claiming the wrong city. Events
  // outside every catchment (most of the countryside) fall back to plain okolo.
  const channel = ev.lat != null && ev.lng != null ? channelForPoint(ev.lat, ev.lng) : null;
  // This is an event link, not just a city link: someone arriving from Google
  // should land back on this exact selection in the map UI. Coordinates let the
  // map construct at the right point before its event lookup completes; the ID
  // remains the source of truth (and Postgres bigint IDs stay strings).
  const mapParams = new URLSearchParams();
  if (isArchived) mapParams.set('when', 'all');
  else mapParams.set('event', String(id));
  if (ev.lat != null && ev.lng != null) {
    mapParams.set('lat', String(ev.lat));
    mapParams.set('lng', String(ev.lng));
  }
  const mapQuery = mapParams.toString();
  const backHref = mapQuery ? `/?${mapQuery}` : '/';

  // Google Event structured data must describe a current publisher claim, not
  // an archive. The facts stay readable, but expired pages emit no Event JSON-LD.
  const ld = isArchived ? null : eventJsonLd(ev, id);
  const when = formatEventDate(ev.starts_at, t.locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Treatment and label are ONE unit: gold is styled and labelled together, or
  // neither (see lib/digest.js — colour alone is not disclosure, ECG §6).
  const hl = HIGHLIGHT[ev.highlight] || null;
  const adTag = ev.highlight === 'gold' ? (STRINGS[lang] || STRINGS.en).adTag : null;

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 72px', fontFamily: 'var(--font-body)' }}>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />}

      {/* Back affordance + city branding in one row — the wordmark IS the way
          back, which is what was missing (there was a link home, but nothing
          that read as "back"). Matches the weekend page's header treatment. */}
      <Link
        href={backHref}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)', textDecoration: 'none' }}
      >
        <span aria-hidden="true" style={{ fontSize: 15, color: 'var(--muted)' }}>←</span>
        <span>
          okolo
          <span style={{ color: 'var(--accent)' }}>{channel ? channel.handle.replace(/^okolo/, '') : '.'}</span>
        </span>
      </Link>

      <article
        style={{
          marginTop: 18,
          // A highlighted event is ringed in its tier colour — the same signal as
          // the map pin's outline ring and the newsletter card's border, so the
          // one concept reads the same on all three. Unhighlighted events render
          // exactly as before (no card, no border).
          ...(hl ? { border: `2px solid ${hl}`, borderRadius: 14, padding: '20px 20px 4px' } : {}),
        }}
      >
        {isArchived && (
          <div
            role="status"
            style={{ background: '#F3F0EA', border: '1px solid #D8D1C5', borderRadius: 12, padding: '13px 15px', marginBottom: 18 }}
          >
            <div style={{ fontWeight: 800, color: 'var(--ink)', marginBottom: 3 }}>✓ {t.past}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.45 }}>{t.pastNote}</div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1.2, margin: '0 0 6px', flex: '1 1 auto' }}>{ev.title}</h1>
          {/* Gold (paid) only — editorial showcases are deliberately unlabelled. */}
          {adTag && (
            <span style={{ flex: '0 0 auto', marginTop: 6, fontSize: 11, fontWeight: 800, color: 'var(--ink)', background: '#FDF3DA', border: `1px solid ${HIGHLIGHT.gold}`, borderRadius: 99, padding: '4px 9px' }}>
              {adTag}
            </span>
          )}
        </div>
        {when && (
          <p style={{ color: 'var(--accent)', fontWeight: 700, margin: '0 0 16px' }}>
            {when}
            {ev.all_day
              ? ` · ${t.allDay}`
              : validTimeOf(ev.starts_at)
                ? ` · ${validTimeOf(ev.starts_at)}${t.clock ? ` ${t.clock}` : ''}`
                : ` · ${t.timeTbd}`}
          </p>
        )}
        <p style={{ fontSize: 15, margin: '0 0 6px' }}>
          📍 {[ev.venue, ev.address, ev.town].filter(Boolean).join(', ')}
        </p>
        {ev.is_free === 1 && <p style={{ color: 'var(--good)', fontWeight: 700, margin: '0 0 6px' }}>{t.free}</p>}
        {ev.description && <p style={{ fontSize: 15.5, lineHeight: 1.65, margin: '16px 0' }}>{ev.description}</p>}
        {/* overflowWrap: a source_url can be a 300-char Facebook permalink with no
            spaces, which otherwise runs off the page (and, now that a highlighted
            event sits in a bordered card, visibly bursts out of it). */}
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '20px 0', overflowWrap: 'anywhere' }}>
          {t.source}:{' '}
          {ev.source_url ? (
            <a href={ev.source_url} target="_blank" rel="noreferrer">{ev.source_name || ev.source_url}</a>
          ) : (
            ev.source_name || t.upload
          )}
        </p>
      </article>

      {isArchived && nearby.length > 0 && (
        <section aria-labelledby="nearby-events" style={{ marginTop: 30 }}>
          <h2 id="nearby-events" style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 12px' }}>
            {t.nearby}
          </h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {nearby.map((next) => {
              const nextWhen = formatEventDate(next.starts_at, t.locale, {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              });
              if (!nextWhen) return null;
              const nextTime = validTimeOf(next.starts_at);
              return (
                <Link
                  key={next.id}
                  href={`/event/${next.id}`}
                  style={{ display: 'block', border: '1px solid #E4DED5', borderRadius: 12, padding: '13px 15px', color: 'var(--ink)', textDecoration: 'none', background: '#FFFEFB' }}
                >
                  <div style={{ fontWeight: 800, lineHeight: 1.35 }}>{next.title}</div>
                  <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13, marginTop: 4 }}>
                    {nextWhen}{nextTime ? ` · ${nextTime}${t.clock ? ` ${t.clock}` : ''}` : ''}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
                    📍 {[next.venue, next.town].filter(Boolean).join(', ')}
                    {next.distance_km != null ? ` · ${next.distance_km} ${t.away}` : ''}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <p style={{ marginTop: 20 }}>
        <Link
          href={backHref}
          style={{
            display: 'inline-block', background: 'var(--accent)', color: '#fff', fontWeight: 700,
            padding: '11px 20px', borderRadius: 12, textDecoration: 'none', fontSize: 14,
          }}
        >
          {isArchived ? t.archiveMap : t.map}
        </Link>
      </p>

      {/* Subscribe right where the interest is. Only where we know the city — a
          signup form with no area would either need a picker (friction that
          throws the intent away) or a guessed area (signing someone up for a
          city they never chose). */}
      {channel && (
        <NewsletterSignup
          // The READER's UI language, not the channel's: this page renders in
          // whatever language they're browsing in, and the route treats the
          // submitted lang as their explicit choice (it drives their confirm
          // mail). The digest itself stays in the channel's local language by
          // design — per-subscriber digest language is deliberately not built.
          lang={lang}
          area={{ label: channel.label, lat: channel.lat, lng: channel.lng }}
          source="event_page"
        />
      )}
    </main>
  );
}
