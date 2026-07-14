import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getEvent } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';

const PAGE_COPY = {
  de: { locale: 'de-AT', notFound: 'Event nicht gefunden', inTown: 'in', onDate: 'am', allDay: 'ganztägig', clock: 'Uhr', free: 'Eintritt frei', source: 'Quelle', upload: 'Foto-Upload', map: 'Auf der Karte ansehen →' },
  en: { locale: 'en-GB', notFound: 'Event not found', inTown: 'in', onDate: 'on', allDay: 'all day', clock: '', free: 'Free entry', source: 'Source', upload: 'Photo upload', map: 'View on the map →' },
  bg: { locale: 'bg-BG', notFound: 'Събитието не е намерено', inTown: 'в', onDate: 'на', allDay: 'целодневно', clock: 'ч.', free: 'Безплатен вход', source: 'Източник', upload: 'Качена снимка', map: 'Виж на картата →' },
};

async function pageCopy() {
  const lang = (await headers()).get('x-okolo-lang');
  return PAGE_COPY[lang] || PAGE_COPY.en;
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
    startDate: ev.all_day ? ev.starts_at.slice(0, 10) : isoVienna(ev.starts_at),
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
  return {
    title: when ? `${ev.title} — ${when} · Okolo` : `${ev.title} · Okolo`,
    description: ev.description || `${ev.title}${ev.town ? ` ${t.inTown} ${ev.town}` : ''}${when ? ` ${t.onDate} ${when}.` : '.'}`,
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

  const ld = jsonLd(ev);
  const when = ev.starts_at
    ? new Intl.DateTimeFormat(t.locale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      }).format(new Date(ev.starts_at.slice(0, 10) + 'T12:00'))
    : null;

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'var(--font-body)' }}>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />}
      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>
        <Link href="/" style={{ textDecoration: 'none' }}>Okolo<span style={{ color: 'var(--accent)' }}>.</span></Link>
      </p>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, lineHeight: 1.2, margin: '18px 0 6px' }}>{ev.title}</h1>
      {when && (
        <p style={{ color: 'var(--accent)', fontWeight: 700, margin: '0 0 16px' }}>
          {when}
          {ev.all_day ? ` · ${t.allDay}` : ` · ${ev.starts_at.slice(11, 16)}${t.clock ? ` ${t.clock}` : ''}`}
        </p>
      )}
      <p style={{ fontSize: 15, margin: '0 0 6px' }}>
        📍 {[ev.venue, ev.address, ev.town].filter(Boolean).join(', ')}
      </p>
      {ev.is_free === 1 && <p style={{ color: 'var(--good)', fontWeight: 700, margin: '0 0 6px' }}>{t.free}</p>}
      {ev.description && <p style={{ fontSize: 15.5, lineHeight: 1.65, margin: '16px 0' }}>{ev.description}</p>}
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '20px 0' }}>
        {t.source}:{' '}
        {ev.source_url ? (
          <a href={ev.source_url} target="_blank" rel="noreferrer">{ev.source_name || ev.source_url}</a>
        ) : (
          ev.source_name || t.upload
        )}
      </p>
      <p>
        <Link
          href="/"
          style={{
            display: 'inline-block', background: 'var(--accent)', color: '#fff', fontWeight: 700,
            padding: '11px 20px', borderRadius: 12, textDecoration: 'none', fontSize: 14,
          }}
        >
          {t.map}
        </Link>
      </p>
    </main>
  );
}
