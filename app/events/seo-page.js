import Link from 'next/link';
import { CATS } from '../../lib/icons.js';
import { STRINGS } from '../../lib/i18n.js';
import { getChannel } from '../../lib/city-channels.js';
import { publicUrl } from '../../lib/public-url.js';
import { validDateOf } from '../../lib/event-time.js';
import {
  SEO_CITIES,
  availableDigestItems,
  cityIntentPath,
  cityMonthPath,
  cityPath,
  monthLabel,
  seoDateRangeLabel,
  upcomingMonthSlugs,
} from '../../lib/seo-pages.js';
import DiscoveryEventLink from './event-link.js';
import EventsBrand from './events-brand.js';
import WeekendHighlights from './weekend-highlights.js';
import styles from './events.module.css';

const S = {
  muted: '#4A5652',
  accent: '#C93A5B',
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

function isInCity(event, city) {
  const town = String(event.town || '').toLocaleLowerCase('de-AT');
  const label = city.label.toLocaleLowerCase('de-AT');
  return town === label || town.startsWith(`${label}-`);
}

function EventCards({ events, returnPath }) {
  return (
    <ol className={styles.eventList}>
      {events.map((ev) => {
        const cat = ev.categories[0];
        const color = CATS[cat]?.color || S.accent;
        const place = eventPlace(ev);
        return (
          <li key={ev.id} className={styles.eventCard} style={{ '--event-color': color }}>
            <DiscoveryEventLink id={ev.id} returnPath={returnPath} className={styles.eventLink}>
              <h3 style={{ fontSize: 19, lineHeight: 1.3, margin: 0 }}>{ev.title}</h3>
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

function EventList({ events, returnPath, city, excludedIds = new Set() }) {
  if (!events.length) {
    return <p style={{ color: S.muted, lineHeight: 1.6 }}>Für diesen Zeitraum sind noch keine Veranstaltungen veröffentlicht. Wir aktualisieren diese Seite laufend.</p>;
  }
  const remaining = events.filter((event) => !excludedIds.has(String(event.id)));
  if (!remaining.length) return null;
  const cityEvents = remaining.filter((event) => isInCity(event, city));
  const nearbyEvents = remaining.filter((event) => !isInCity(event, city));
  const groups = [
    { key: 'city', title: `Veranstaltungen in ${city.label}`, events: cityEvents },
    { key: 'nearby', title: `Weitere Termine rund um ${city.label}`, events: nearbyEvents },
  ].filter((group) => group.events.length);
  return (
    <div className={styles.eventGroups}>
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`event-group-${group.key}`} className={styles.eventGroup}>
          <div className={styles.eventGroupHeading}>
            <h2 id={`event-group-${group.key}`}>{group.title}</h2>
            <span>{group.events.length} angezeigt</span>
          </div>
          <EventCards events={group.events} returnPath={returnPath} />
        </section>
      ))}
    </div>
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

function formatFreshness(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('de-AT', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Vienna',
  }).format(date);
}

function PageEvidence({ city, events, range, total, facets, lastModified }) {
  if (!range || total == null) return null;
  const dates = seoDateRangeLabel(range.from, range.to);
  const sources = new Set(events.map((event) => event.source_name).filter(Boolean)).size;
  const freshness = formatFreshness(lastModified);
  return (
    <aside className={styles.evidence} aria-label="Aktualität und Quellen">
      <div className={styles.evidencePrimary}>
        <strong>{total} aktuelle Veranstaltungen</strong>
        {dates && <span>{dates}</span>}
        <span>bis {city.radiusKm} km rund um {city.label}</span>
      </div>
      <div className={styles.evidenceSecondary}>
        {facets?.kids > 0 && <span>{facets.kids} für Kinder oder Familien</span>}
        {facets?.free > 0 && <span>{facets.free} als gratis gekennzeichnet</span>}
        {sources > 0 && <span>{sources} benannte Quellen in der angezeigten Auswahl</span>}
        {freshness && <span>zuletzt aktualisiert: {freshness} Uhr</span>}
      </div>
      <Link href="/events/methodology" className={styles.methodLink}>So findet und prüft Okolo Veranstaltungen →</Link>
    </aside>
  );
}

export default function SeoEventPage({
  city, title, intro, events, path, month, intent, digest, range, total, facets, lastModified,
}) {
  const months = upcomingMonthSlugs();
  const channel = getChannel(city.slug);
  const mapUrl = `/?when=all&lat=${city.lat}&lng=${city.lng}`;
  const digestItems = intent === 'wochenende' ? availableDigestItems(digest, events) : [];
  const highlightedIds = new Set(digestItems.map((item) => String(item.id)));
  return (
    <main lang="de-AT" className={styles.page}>
      <div className={styles.shell}>
        <EventsBrand />
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/events">Events</Link> / {month ? <><Link href={cityPath(city)}>{city.label}</Link> / {monthLabel(month)}</> : city.label}
        </nav>

        <section className={styles.detailHero}>
          <h1 className={`${styles.title} ${styles.cityTitle}`}>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <div className={styles.actions}>
            <Link href={mapUrl} className={styles.primaryAction}>
              Auf der Karte ansehen <span className={styles.actionArrow} aria-hidden="true">→</span>
            </Link>
            {channel && intent !== 'wochenende' && (
              <Link href={`/events/${city.slug}/wochenende`} className={styles.secondaryAction}>
                Dieses Wochenende <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
          <PageEvidence
            city={city}
            events={events}
            range={range}
            total={total}
            facets={facets}
            lastModified={lastModified}
          />
        </section>

        <div className={styles.filterBlock}>
          <nav aria-label="Themen" className={styles.filterNav}>
            <Link href={cityPath(city)} className={pillClass(!month && !intent)}>Alle</Link>
            <Link href={cityIntentPath(city, 'heute')} className={pillClass(intent === 'heute')}>Heute</Link>
            <Link href={cityIntentPath(city, 'wochenende')} className={pillClass(intent === 'wochenende')}>Wochenende</Link>
            <Link href={cityIntentPath(city, 'kinder')} className={pillClass(intent === 'kinder')}>Für Kinder</Link>
          </nav>

          <nav aria-label="Monate" className={`${styles.filterNav} ${styles.monthNav}`}>
            {months.map((slug) => (
              <Link key={slug} href={cityMonthPath(city, slug)} aria-current={slug === month ? 'page' : undefined} className={pillClass(slug === month)}>
                {monthLabel(slug)}
              </Link>
            ))}
          </nav>
        </div>

        <WeekendHighlights digest={digest} events={events} returnPath={path} />

        <EventList events={events} returnPath={path} city={city} excludedIds={highlightedIds} />

        <nav aria-label="Weitere Städte" className={styles.otherCities}>
          <h2>Weitere Städte in Österreich</h2>
          <div className={styles.otherCitiesLinks}>
            {SEO_CITIES.filter((other) => other.slug !== city.slug).map((other) => (
              <Link key={other.slug} href={cityPath(other)} className={styles.otherCity}>{other.label}</Link>
            ))}
          </div>
          <Link href="/events/methodology" className={styles.footerMethodLink}>Wie Okolo Veranstaltungen sammelt und prüft</Link>
        </nav>
      </div>
    </main>
  );
}

function pillClass(active) {
  return `${styles.pill}${active ? ` ${styles.pillActive}` : ''}`;
}
