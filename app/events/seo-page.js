import Link from 'next/link';
import { CATS } from '../../lib/icons.js';
import { STRINGS } from '../../lib/i18n.js';
import { getChannel } from '../../lib/city-channels.js';
import { publicUrl } from '../../lib/public-url.js';
import { validDateOf } from '../../lib/event-time.js';
import {
  SEO_CITIES,
  cityIntentPath,
  cityMonthPath,
  cityPath,
  monthLabel,
  upcomingMonthSlugs,
} from '../../lib/seo-pages.js';
import DiscoveryEventLink from './event-link.js';

const S = {
  ink: '#212B28',
  muted: '#4A5652',
  accent: '#C93A5B',
  line: '#E4E4DD',
  panel: '#FFFFFF',
  bg: '#F7F6F1',
};

function eventDate(ev) {
  const format = (value) => new Intl.DateTimeFormat('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
  if (ev.ongoing) {
    const end = validDateOf(ev.ends_at);
    return end ? `Veröffentlichter Zeitraum · bis ${format(end)}` : 'Veröffentlichter Zeitraum';
  }
  const day = format(ev.starts_at.slice(0, 10));
  if (ev.all_day) return `${day} · ganztägig`;
  if (ev.starts_at.length === 10) return `${day} · Uhrzeit nicht angegeben`;
  return `${day} · ${ev.starts_at.slice(11, 16)} Uhr`;
}

function eventPlace(ev) {
  return [ev.venue, ev.town]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(' · ');
}

function localDate(value, options = {}) {
  if (!value) return null;
  return new Intl.DateTimeFormat('de-AT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Vienna',
    ...options,
  }).format(new Date(value));
}

function rangeLabel(range) {
  if (!range?.from || !range?.to) return null;
  const from = localDate(`${range.from}T12:00:00+02:00`);
  const to = localDate(`${range.to}T12:00:00+02:00`);
  return range.from === range.to ? from : `${from} bis ${to}`;
}

function EventList({ events, returnPath }) {
  if (!events.length) {
    return <p style={{ color: S.muted, lineHeight: 1.6 }}>Für diesen Zeitraum sind noch keine Veranstaltungen veröffentlicht. Wir aktualisieren diese Seite laufend.</p>;
  }
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'grid', gap: 12 }}>
      {events.map((ev) => {
        const cat = ev.categories[0];
        const color = CATS[cat]?.color || S.accent;
        const place = eventPlace(ev);
        return (
          <li key={ev.id} style={{ background: S.panel, border: `1px solid ${S.line}`, borderLeft: `5px solid ${color}`, borderRadius: 14, padding: '16px 18px' }}>
            <DiscoveryEventLink id={ev.id} returnPath={returnPath} style={{ color: 'inherit', textDecoration: 'none' }}>
              <h2 style={{ fontSize: 19, lineHeight: 1.3, margin: 0 }}>{ev.title}</h2>
              <p style={{ color, fontSize: 14, fontWeight: 700, margin: '6px 0 0' }}>
                {eventDate(ev)}
                {place && <span style={{ color: S.muted, fontWeight: 400 }}> · {place}</span>}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {ev.is_free === 1 && <span style={badgeStyle(color)}>Gratis</span>}
                {ev.categories.slice(0, 3).map((key) => <span key={key} style={badgeStyle(color)}>{STRINGS.de.cats[key] || key}</span>)}
              </div>
              {ev.source_name && <p style={{ color: S.muted, fontSize: 12, margin: '9px 0 0' }}>Quelle: {ev.source_name}</p>}
            </DiscoveryEventLink>
          </li>
        );
      })}
    </ol>
  );
}

function badgeStyle(color) {
  return { background: color, color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '4px 9px' };
}

export function collectionJsonLd({ city, title, description, path, events, lastModified }) {
  const url = publicUrl(path);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: title,
        description,
        url,
        ...(lastModified ? { dateModified: new Date(lastModified).toISOString() } : {}),
        about: { '@type': 'City', name: city.label, addressCountry: 'AT' },
        mainEntity: { '@id': `${url}#event-list` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Events', item: publicUrl('events') },
          { '@type': 'ListItem', position: 2, name: city.label, item: publicUrl(cityPath(city)) },
          ...(path === cityPath(city) ? [] : [{ '@type': 'ListItem', position: 3, name: title, item: url }]),
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#event-list`,
        numberOfItems: events.length,
        itemListElement: events.map((ev, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: ev.title,
          url: publicUrl(`event/${ev.id}`),
        })),
      },
    ],
  };
}

export default function SeoEventPage({ city, title, intro, total, events, facets, range, lastModified, path, month, intent }) {
  const months = upcomingMonthSlugs();
  const channel = getChannel(city.slug);
  const mapUrl = `/?lat=${city.lat}&lng=${city.lng}`;
  const period = rangeLabel(range);
  const refreshed = localDate(lastModified, { hour: '2-digit', minute: '2-digit' });
  return (
    <main lang="de-AT" style={{ minHeight: '100vh', background: S.bg, color: S.ink, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '30px 20px 72px' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: S.ink, fontSize: 20, fontWeight: 800, textDecoration: 'none' }}>
          <span aria-hidden="true" style={{ color: S.accent }}>●</span> Okolo
        </Link>
        <nav aria-label="Breadcrumb" style={{ color: S.muted, fontSize: 13, marginTop: 20 }}>
          <Link href="/events" style={{ color: S.muted }}>Events</Link> / {month ? <><Link href={cityPath(city)} style={{ color: S.muted }}>{city.label}</Link> / {monthLabel(month)}</> : city.label}
        </nav>

        <h1 style={{ fontSize: 34, lineHeight: 1.15, letterSpacing: -0.5, margin: '18px 0 10px' }}>{title}</h1>
        <p style={{ color: S.muted, fontSize: 17, lineHeight: 1.6, margin: 0 }}>{intro}</p>

        <section aria-label="Kurzantwort" style={{ background: S.panel, border: `1px solid ${S.line}`, borderRadius: 14, padding: '16px 18px', marginTop: 18 }}>
          <p style={{ fontSize: 16, lineHeight: 1.55, margin: 0 }}>
            <strong>Kurz gesagt:</strong> Okolo kennt {total} veröffentlichte Veranstaltungen für {period} im Umkreis von {city.radiusKm} km rund um {city.label}.
            {facets?.kids > 0 && ` ${facets.kids} davon sind für Kinder oder Familien geeignet.`}
            {facets?.free > 0 && ` ${facets.free} sind als gratis gekennzeichnet.`}
          </p>
          <p style={{ color: S.muted, fontSize: 12.5, lineHeight: 1.5, margin: '9px 0 0' }}>
            Zeitraum: {period} · Gebiet: {city.label} und Umgebung · {events.length < total ? `${events.length} passende Termine angezeigt · ` : ''}Datenstand: {refreshed || 'noch keine veröffentlichten Termine'}. Mehrtagestermine zählen, wenn ihr veröffentlichter Zeitraum das Datum umfasst. Quellen und Original-Link stehen auf jeder Eventseite.
          </p>
        </section>

        <nav aria-label="Themen" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 24 }}>
          <Link href={cityPath(city)} style={navPill(!month && !intent)}>Alle</Link>
          <Link href={cityIntentPath(city, 'heute')} style={navPill(intent === 'heute')}>Heute</Link>
          <Link href={cityIntentPath(city, 'wochenende')} style={navPill(intent === 'wochenende')}>Wochenende</Link>
          <Link href={cityIntentPath(city, 'kinder')} style={navPill(intent === 'kinder')}>Für Kinder</Link>
        </nav>

        <nav aria-label="Monate" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {months.map((slug) => (
            <Link key={slug} href={cityMonthPath(city, slug)} aria-current={slug === month ? 'page' : undefined} style={{ border: `1px solid ${slug === month ? S.accent : S.line}`, background: slug === month ? '#FBEEF1' : S.panel, color: slug === month ? S.accent : S.ink, borderRadius: 99, padding: '8px 12px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
              {monthLabel(slug)}
            </Link>
          ))}
        </nav>

        <EventList events={events} returnPath={path} />

        <section style={{ background: S.panel, border: `1px solid ${S.line}`, borderRadius: 14, padding: 20, marginTop: 28 }}>
          <h2 style={{ fontSize: 19, margin: 0 }}>Mehr rund um {city.label}</h2>
          <p style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', margin: '14px 0 0' }}>
            <a href={mapUrl} style={{ color: S.accent, fontWeight: 700 }}>Events auf der Karte →</a>
            {channel && <Link href={`/weekend/${channel.slug}`} style={{ color: S.accent, fontWeight: 700 }}>Dieses Wochenende →</Link>}
          </p>
        </section>

        <nav aria-label="Weitere Städte" style={{ marginTop: 30 }}>
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Weitere Städte in Österreich</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
            {SEO_CITIES.filter((other) => other.slug !== city.slug).map((other) => (
              <Link key={other.slug} href={cityPath(other)} style={{ color: S.accent }}>{other.label}</Link>
            ))}
          </div>
        </nav>
      </div>
    </main>
  );
}

function navPill(active) {
  return { border: `1px solid ${active ? S.accent : S.line}`, background: active ? '#FBEEF1' : S.panel, color: active ? S.accent : S.ink, borderRadius: 99, padding: '8px 12px', fontSize: 13, fontWeight: 700, textDecoration: 'none' };
}
