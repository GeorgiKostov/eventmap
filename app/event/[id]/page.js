import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getEvent } from '../../../lib/db.js';
import { hasTime } from '../../../lib/event-time.js';
import { channelForPoint } from '../../../lib/city-channels.js';
import { STRINGS } from '../../../lib/i18n.js';
import NewsletterSignup from '../../newsletter-signup.js';

export const dynamic = 'force-dynamic';

// Highlight ring colours — same two as the map pins (app/page.js
// HIGHLIGHT_COLORS) and the newsletter (lib/digest.js HIGHLIGHT). This page is
// inline-styled like its siblings, so the hex is restated rather than tokenized.
const HIGHLIGHT = { gold: '#E8A800', editorial: '#C93A5B' };

const PAGE_COPY = {
  de: { locale: 'de-AT', notFound: 'Event nicht gefunden', inTown: 'in', onDate: 'am', allDay: 'ganztägig', timeTbd: 'Uhrzeit nicht angegeben', clock: 'Uhr', free: 'Eintritt frei', source: 'Quelle', upload: 'Foto-Upload', map: 'Auf der Karte ansehen →', back: 'Zurück zur Karte' },
  en: { locale: 'en-GB', notFound: 'Event not found', inTown: 'in', onDate: 'on', allDay: 'all day', timeTbd: 'time not stated', clock: '', free: 'Free entry', source: 'Source', upload: 'Photo upload', map: 'View on the map →', back: 'Back to the map' },
  bg: { locale: 'bg-BG', notFound: 'Събитието не е намерено', inTown: 'в', onDate: 'на', allDay: 'целодневно', timeTbd: 'часът не е посочен', clock: 'ч.', free: 'Безплатен вход', source: 'Източник', upload: 'Качена снимка', map: 'Виж на картата →', back: 'Обратно към картата' },
};

async function pageCopy() {
  const lang = await pageLang();
  return PAGE_COPY[lang] || PAGE_COPY.en;
}

async function pageLang() {
  const lang = (await headers()).get('x-okolo-lang');
  return PAGE_COPY[lang] ? lang : 'en';
}

// Naive-local → ISO 8601 with Vienna offset (DST approximation is fine here:
// late Mar–late Oct is CEST; schema.org consumers mostly care about the date).
function isoVienna(local) {
  const m = +local.slice(5, 7);
  const offset = m >= 4 && m <= 10 ? '+02:00' : '+01:00';
  return `${local}:00${offset}`;
}

function jsonLd(ev) {
  // Places (kind='place') are evergreen locations, not schema.org Events —
  // they have no starts_at/ends_at. Skip Event JSON-LD for them (a dedicated
  // Place/LocalBusiness schema is a later decision, not needed for the prototype).
  if (ev.kind === 'place') return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.title,
    description: ev.description || undefined,
    // schema.org/Event accepts a bare Date. When the source published no time we
    // emit the date alone rather than a made-up hour — this JSON-LD is what Google
    // and the AI assistants ingest, so a fabricated startDate here is the single
    // most widely-copied lie we could tell (hard rule 5).
    startDate: ev.all_day || !hasTime(ev.starts_at) ? ev.starts_at.slice(0, 10) : isoVienna(ev.starts_at),
    endDate: ev.ends_at ? (ev.all_day ? ev.ends_at.slice(0, 10) : isoVienna(ev.ends_at)) : undefined,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: ev.venue || ev.town || undefined,
      address: {
        '@type': 'PostalAddress',
        streetAddress: ev.address || undefined,
        addressLocality: ev.town || undefined,
        addressCountry: 'AT',
      },
      geo: { '@type': 'GeoCoordinates', latitude: ev.lat, longitude: ev.lng },
    },
    isAccessibleForFree: ev.is_free === 1 ? true : ev.is_free === 0 ? false : undefined,
    offers: ev.is_free === 1 ? { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } : undefined,
    typicalAgeRange: ev.age_min != null ? `${ev.age_min}-${ev.age_max ?? ''}` : undefined,
    sameAs: ev.source_url || undefined,
  };
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const ev = await getEvent(+id);
  const t = await pageCopy();
  if (!ev) return { title: `${t.notFound} — Okolo` };
  const when = ev.starts_at ? ev.starts_at.slice(0, 10) : null;
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
    openGraph: {
      title: ev.title,
      description: ev.description || undefined,
      type: 'article',
      locale: t.locale.replace('-', '_'),
    },
  };
}

export default async function EventPage({ params }) {
  const { id } = await params;
  const ev = await getEvent(+id);
  if (!ev) notFound();
  const t = await pageCopy();
  const lang = await pageLang();

  // Which city this event belongs to, from its own coordinates. George: the page
  // "just says okolo instead of okolo.linz or wherever you came from". Deriving
  // the channel from the EVENT (not from a referrer or a query param) means the
  // branding is right however the reader arrived — Google, a pasted link, the
  // newsletter — and it can't be spoofed into claiming the wrong city. Events
  // outside every catchment (most of the countryside) fall back to plain okolo.
  const channel = ev.lat != null && ev.lng != null ? channelForPoint(ev.lat, ev.lng) : null;
  // Back goes to the map centred on that city, not to the bare root: a reader who
  // came from search has no history to go back TO, and dropping them on the
  // default viewport is how you lose them. The browser's own back button still
  // handles in-app navigation.
  const backHref = channel ? `/?lat=${channel.lat}&lng=${channel.lng}` : '/';

  const ld = jsonLd(ev);
  const when = ev.starts_at
    ? new Intl.DateTimeFormat(t.locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }).format(new Date(ev.starts_at.slice(0, 10) + 'T12:00'))
    : null;

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
              : hasTime(ev.starts_at)
                ? ` · ${ev.starts_at.slice(11, 16)}${t.clock ? ` ${t.clock}` : ''}`
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

      <p style={{ marginTop: 20 }}>
        <Link
          href={backHref}
          style={{
            display: 'inline-block', background: 'var(--accent)', color: '#fff', fontWeight: 700,
            padding: '11px 20px', borderRadius: 12, textDecoration: 'none', fontSize: 14,
          }}
        >
          {t.map}
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
