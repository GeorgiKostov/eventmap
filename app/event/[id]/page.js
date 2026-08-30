import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getEventLanding, nearbyUpcomingEvents } from '../../../lib/db.js';
import { validDateOf, validTimeOf } from '../../../lib/event-time.js';
import { channelForPoint } from '../../../lib/city-channels.js';
import { eventDescription, eventJsonLd } from '../../../lib/event-jsonld.js';
import { safeDiscoveryReturn } from '../../../lib/return-path.js';
import { STRINGS } from '../../../lib/i18n.js';
import { cityIntentPath, cityMonthPath, cityPath, isSupportedMonth, monthLabel, seoCityForPoint } from '../../../lib/seo-pages.js';
import NewsletterSignup from '../../newsletter-signup.js';
import { EventLandingView, MapDiscoveryLink, TrackedEventLink } from '../../event-analytics.js';
import OkoloBrand from '../../okolo-brand.js';

export const dynamic = 'force-dynamic';

// Highlight ring colours — same two as the map pins (app/page.js
// HIGHLIGHT_COLORS) and the newsletter (lib/digest.js HIGHLIGHT). This page is
// inline-styled like its siblings, so the hex is restated rather than tokenized.
const HIGHLIGHT = { gold: '#E8A800', editorial: '#C93A5B' };

const PAGE_COPY = {
  de: { locale: 'de-AT', notFound: 'Event nicht gefunden', inTown: 'in', onDate: 'am', allDay: 'ganztägig', timeTbd: 'Uhrzeit nicht angegeben', clock: 'Uhr', until: 'bis', free: 'Eintritt frei', source: 'Quelle', upload: 'Foto-Upload', mapHero: 'Event auf der Karte öffnen', mapHeroNote: 'Entdecke weitere Veranstaltungen in der Nähe.', archiveMapHero: 'Kommende Events in der Nähe ansehen', archiveMapHeroNote: 'Entdecke, was rund um diesen Ort als Nächstes passiert.', exploreMap: 'Events in der Nähe entdecken', more: (city) => `Mehr in ${city}`, cityEvents: (city) => `Alle Events in ${city}`, today: 'Events heute', weekend: 'Dieses Wochenende', kids: 'Kinderveranstaltungen', back: 'Zurück zur Karte', weekendBack: 'Zurück zur Wochenendseite', discoveryBack: 'Zurück zur Eventliste', past: 'Diese Veranstaltung ist vorbei', pastNote: 'Die Seite bleibt als Archiv erhalten. Entdecke, was als Nächstes in der Nähe passiert.', nearby: 'Demnächst in der Nähe', away: 'km entfernt', ageFrom: (n) => `Ab ${n} Jahren`, ageTo: (n) => `Bis ${n} Jahre` },
  en: { locale: 'en-GB', notFound: 'Event not found', inTown: 'in', onDate: 'on', allDay: 'all day', timeTbd: 'time not stated', clock: '', until: 'until', free: 'Free entry', source: 'Source', upload: 'Photo upload', mapHero: 'Open this event on the map', mapHeroNote: 'Discover more events happening nearby.', archiveMapHero: 'See upcoming events nearby', archiveMapHeroNote: 'Discover what is happening next around this place.', exploreMap: 'Explore events nearby', more: (city) => `More in ${city}`, cityEvents: (city) => `All events in ${city}`, today: 'Events today', weekend: 'This weekend', kids: 'Events for children', back: 'Back to the map', weekendBack: 'Back to the weekend page', discoveryBack: 'Back to the event list', past: 'This event has ended', pastNote: 'This page remains as an archive. Discover what is coming up nearby.', nearby: 'Coming up nearby', away: 'km away', ageFrom: (n) => `Ages ${n}+`, ageTo: (n) => `Up to age ${n}` },
  bg: { locale: 'bg-BG', notFound: 'Събитието не е намерено', inTown: 'в', onDate: 'на', allDay: 'целодневно', timeTbd: 'часът не е посочен', clock: 'ч.', until: 'до', free: 'Безплатен вход', source: 'Източник', upload: 'Качена снимка', mapHero: 'Отвори събитието на картата', mapHeroNote: 'Открий още събития наблизо.', archiveMapHero: 'Виж предстоящите събития наблизо', archiveMapHeroNote: 'Открий какво предстои около това място.', exploreMap: 'Открий събития наблизо', more: (city) => `Още в ${city}`, cityEvents: (city) => `Всички събития в ${city}`, today: 'Събития днес', weekend: 'Този уикенд', kids: 'Събития за деца', back: 'Обратно към картата', weekendBack: 'Обратно към страницата за уикенда', discoveryBack: 'Обратно към списъка със събития', past: 'Това събитие приключи', pastNote: 'Страницата остава като архив. Открий какво предстои наблизо.', nearby: 'Предстоящи събития наблизо', away: 'км разстояние', ageFrom: (n) => `За ${n}+ години`, ageTo: (n) => `До ${n} години` },
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
    description: eventDescription(ev),
    // Override the root layout's canonical '/': without this every event page
    // declares itself a duplicate of the homepage and Google drops it.
    alternates: { canonical: `/event/${id}` },
    ...((isArchived || !when || ev.report_flag) ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: ev.title,
      description: eventDescription(ev),
      images: [{ url: `/event/${id}/opengraph-image`, width: 1200, height: 675 }],
      type: 'article',
      locale: t.locale.replace('-', '_'),
    },
  };
}

export default async function EventPage({ params, searchParams }) {
  const { id } = await params;
  const ev = await getEventLanding(id);
  if (!ev) notFound();
  const t = await pageCopy();
  const lang = await pageLang();
  const isArchived = ev.status === 'expired';
  const nearby = await nearbyUpcomingEvents({
    lat: ev.lat,
    lng: ev.lng,
    excludeId: ev.id,
    categories: ev.categories,
  });

  // Which city this event belongs to, from its own coordinates. George: the page
  // "just says okolo instead of okolo.linz or wherever you came from". Deriving
  // the channel from the EVENT (not from a referrer or a query param) means the
  // branding is right however the reader arrived — Google, a pasted link, the
  // newsletter — and it can't be spoofed into claiming the wrong city. Events
  // outside every catchment (most of the countryside) fall back to plain okolo.
  const channel = ev.lat != null && ev.lng != null ? channelForPoint(ev.lat, ev.lng) : null;
  const seoCity = ev.lat != null && ev.lng != null ? seoCityForPoint(ev.lat, ev.lng) : null;
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
  const mapHref = mapQuery ? `/?${mapQuery}` : '/';
  // A reader who opened an event from one of our lists expects Back to restore
  // that exact list. Accept only our closed same-origin route shapes; direct
  // Google arrivals still go back to the exact event on the map.
  const discoveryReturn = safeDiscoveryReturn((await searchParams)?.from);
  const weekendReturn = discoveryReturn?.startsWith('/weekend/') ? discoveryReturn : null;
  const eventListReturn = discoveryReturn?.startsWith('/events/') ? discoveryReturn : null;
  const backLabel = weekendReturn ? t.weekendBack : eventListReturn ? t.discoveryBack : t.back;
  const headerLabel = discoveryReturn ? backLabel : t.exploreMap;

  // Google Event structured data must describe a current publisher claim, not
  // an archive. The facts stay readable, but expired pages emit no Event JSON-LD.
  const ld = (isArchived || ev.report_flag) ? null : eventJsonLd(ev, id);
  const when = formatEventDate(ev.starts_at, t.locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const startDate = validDateOf(ev.starts_at);
  const endDate = validDateOf(ev.ends_at);
  const startTime = validTimeOf(ev.starts_at);
  const endTime = validTimeOf(ev.ends_at);
  const endWhen = endDate && endDate !== startDate
    ? formatEventDate(ev.ends_at, t.locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;
  const ui = STRINGS[lang] || STRINGS.en;
  const age = ev.age_min != null && ev.age_max != null
    ? ui.ageRec.replace('{min}', ev.age_min).replace('{max}', ev.age_max)
    : ev.age_min != null
      ? t.ageFrom(ev.age_min)
      : ev.age_max != null
        ? t.ageTo(ev.age_max)
        : null;
  const facts = [
    ...(ev.categories || []).map((category) => ui.cats?.[category]).filter(Boolean),
    age,
    ev.indoor === 1 ? ui.indoorTag : ev.indoor === 0 ? ui.outdoorTag : null,
  ].filter(Boolean);

  // Treatment and label are ONE unit: gold is styled and labelled together, or
  // neither (see lib/digest.js — colour alone is not disclosure, ECG §6).
  const hl = HIGHLIGHT[ev.highlight] || null;
  const adTag = ev.highlight === 'gold' ? (STRINGS[lang] || STRINGS.en).adTag : null;

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 72px', fontFamily: 'var(--font-body)' }}>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />}
      <EventLandingView
        eventId={String(ev.id)}
        status={ev.status}
        town={ev.town}
        category={ev.categories?.[0] || null}
        channel={channel?.slug || null}
        highlight={ev.highlight || null}
      />

      {/* A genuine internal return restores its list/weekend context. A direct
          search landing has nowhere to go "back" to, so its wordmark invites
          nearby discovery and records this otherwise invisible map entrance. */}
      {discoveryReturn ? (
        <Link
          href={discoveryReturn}
          aria-label={headerLabel}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)', textDecoration: 'none' }}
        >
          <OkoloBrand href={null} channelHandle={channel?.handle} />
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>{headerLabel}</span>
        </Link>
      ) : (
        <MapDiscoveryLink
          href={mapHref}
          aria-label={headerLabel}
          eventId={ev.id}
          status={ev.status}
          town={ev.town}
          highlight={ev.highlight}
          placement="header"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)', textDecoration: 'none' }}
        >
          <OkoloBrand href={null} channelHandle={channel?.handle} />
          <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600 }}>{headerLabel}</span>
        </MapDiscoveryLink>
      )}

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
              : startTime
                ? ` · ${startTime}${endDate === startDate && endTime && endTime !== startTime ? `–${endTime}` : ''}${t.clock ? ` ${t.clock}` : ''}`
                : ` · ${t.timeTbd}`}
            {endWhen ? ` · ${t.until} ${endWhen}${endTime ? `, ${endTime}${t.clock ? ` ${t.clock}` : ''}` : ''}` : ''}
          </p>
        )}
        <p style={{ fontSize: 15, margin: '0 0 6px' }}>
          📍 {[ev.venue, ev.address, ev.town].filter(Boolean).join(', ')}
        </p>
        {ev.is_free === 1 && <p style={{ color: 'var(--good)', fontWeight: 700, margin: '0 0 6px' }}>{t.free}</p>}
        {ev.report_flag && ui.reportFlags?.[ev.report_flag] && (
          <p role="status" style={{ background: '#FFF4DA', border: '1px solid #E8A800', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.45, margin: '12px 0' }}>
            ⚠ {ui.reportFlags[ev.report_flag]}
          </p>
        )}
        {facts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
            {facts.map((fact) => (
              <span key={fact} style={{ background: '#F3F0EA', color: 'var(--ink)', borderRadius: 99, padding: '5px 9px', fontSize: 12.5, fontWeight: 700 }}>
                {fact}
              </span>
            ))}
          </div>
        )}
        <MapDiscoveryLink
          href={mapHref}
          eventId={ev.id}
          status={ev.status}
          town={ev.town}
          highlight={ev.highlight}
          placement="hero"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
            background: 'var(--accent)', color: '#fff', borderRadius: 12, padding: '13px 16px',
            margin: '16px 0 4px', textDecoration: 'none', boxShadow: '0 4px 14px rgba(201, 58, 91, .18)',
          }}
        >
          <span>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 15, lineHeight: 1.35 }}>
              {isArchived ? t.archiveMapHero : t.mapHero}
            </span>
            <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.35, opacity: 0.9 }}>
              {isArchived ? t.archiveMapHeroNote : t.mapHeroNote}
            </span>
          </span>
          <span aria-hidden="true" style={{ flex: '0 0 auto', fontSize: 20 }}>→</span>
        </MapDiscoveryLink>
        <p style={{ fontSize: 15.5, lineHeight: 1.65, margin: '16px 0' }}>{eventDescription(ev)}</p>
        {/* overflowWrap: a source_url can be a 300-char Facebook permalink with no
            spaces, which otherwise runs off the page (and, now that a highlighted
            event sits in a bordered card, visibly bursts out of it). */}
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '20px 0', overflowWrap: 'anywhere' }}>
          {t.source}:{' '}
          {ev.source_url ? (
            <TrackedEventLink
              href={ev.source_url}
              target="_blank"
              rel="noreferrer"
              external
              eventName="event_source_open"
              eventProps={{ id: String(ev.id), status: ev.status, town: ev.town || null, surface: 'event_page', highlight: ev.highlight || null }}
              secondaryEventName={ev.highlight === 'gold' ? 'sponsored_referral' : null}
              secondaryEventProps={{ id: String(ev.id), tier: 'gold', surface: 'event_page', target: 'source' }}
            >
              {ev.source_name || ev.source_url}
            </TrackedEventLink>
          ) : (
            ev.source_name || t.upload
          )}
        </p>
      </article>

      {nearby.length > 0 && (
        <section aria-labelledby="nearby-events" style={{ marginTop: 30 }}>
          <h2 id="nearby-events" style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 12px' }}>
            {t.nearby}
          </h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {nearby.map((next, index) => {
              const nextWhen = formatEventDate(next.starts_at, t.locale, {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              });
              if (!nextWhen) return null;
              const nextTime = validTimeOf(next.starts_at);
              return (
                <TrackedEventLink
                  key={next.id}
                  href={`/event/${next.id}`}
                  eventName="event_recommendation_open"
                  eventProps={{ from_id: String(ev.id), to_id: String(next.id), from_status: ev.status, position: index + 1, surface: 'event_page' }}
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
                </TrackedEventLink>
              );
            })}
          </div>
        </section>
      )}

      {seoCity && (
        <nav aria-label={t.more(seoCity.label)} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, marginTop: 22 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>{t.more(seoCity.label)}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px 16px', fontSize: 14 }}>
            <Link href={cityPath(seoCity)} style={{ color: 'var(--accent)', fontWeight: 700 }}>{t.cityEvents(seoCity.label)}</Link>
            <Link href={cityIntentPath(seoCity, 'heute')} style={{ color: 'var(--accent)', fontWeight: 700 }}>{t.today}</Link>
            <Link href={cityIntentPath(seoCity, 'wochenende')} style={{ color: 'var(--accent)', fontWeight: 700 }}>{t.weekend}</Link>
            <Link href={cityIntentPath(seoCity, 'kinder')} style={{ color: 'var(--accent)', fontWeight: 700 }}>{t.kids}</Link>
            {ev.starts_at && isSupportedMonth(ev.starts_at.slice(0, 7)) && (
              <Link href={cityMonthPath(seoCity, ev.starts_at.slice(0, 7))} style={{ color: 'var(--accent)', fontWeight: 700 }}>{monthLabel(ev.starts_at.slice(0, 7))}</Link>
            )}
          </div>
        </nav>
      )}

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
