import Link from 'next/link';
import { SEO_CITIES, cityPath } from '../../lib/seo-pages.js';
import { publicUrl } from '../../lib/public-url.js';
import EventsBrand from './events-brand.js';
import styles from './events.module.css';

export const metadata = {
  title: 'Events in Österreich',
  description: 'Finde aktuelle Veranstaltungen und Ausflugsideen in österreichischen Städten — von Linz und Wien bis Graz, Salzburg und Innsbruck.',
  alternates: { canonical: '/events' },
};

const ld = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Events in Österreich',
  url: publicUrl('events'),
  hasPart: SEO_CITIES.map((city) => ({ '@type': 'WebPage', name: `Events in ${city.label}`, url: publicUrl(cityPath(city)) })),
};

export default function EventsIndex() {
  return (
    <main lang="de-AT" className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <div className={styles.shell}>
        <EventsBrand />

        <section className={styles.indexHero}>
          <p className={styles.eyebrow}>Dein Eventkalender für Österreich</p>
          <h1 className={styles.title}>Events in Österreich</h1>
          <p className={styles.intro}>Entdecke aktuelle Veranstaltungen, Familienprogramm, Märkte, Kultur und Ausflugsideen in deiner Stadt.</p>
          <div className={styles.actions}>
            <Link href="/?when=all" className={styles.primaryAction}>
              Zur Event-Karte <span className={styles.actionArrow} aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <ul className={styles.cityGrid} aria-label="Städte in Österreich">
          {SEO_CITIES.map((city) => (
            <li key={city.slug}>
              <Link href={cityPath(city)} className={styles.cityCard}>
                <span>
                  <span className={styles.cityName}>{city.label}</span>
                  <span className={styles.cityMeta}>Events &amp; Ausflugsideen</span>
                </span>
                <span className={styles.cardArrow} aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className={styles.indexMethod}>
          Okolo bündelt Termine aus offiziellen und freigegebenen lokalen Quellen, zeigt die Herkunft jedes Events und ergänzt keine unbekannten Angaben.{' '}
          <Link href="/events/methodology">So arbeitet Okolo →</Link>
        </p>
      </div>
    </main>
  );
}
