import Link from 'next/link';
import { publicUrl } from '../../../lib/public-url.js';
import OkoloBrand from '../../okolo-brand.js';
import styles from '../events.module.css';

export const metadata = {
  title: 'So findet und prüft Okolo Veranstaltungen',
  description: 'Wie Okolo Termine aus offiziellen und lokalen Quellen sammelt, prüft, aktualisiert und mit dem Original verlinkt.',
  alternates: { canonical: '/events/methodology' },
};

const ld = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: 'So findet und prüft Okolo Veranstaltungen',
  description: metadata.description,
  url: publicUrl('events/methodology'),
  isPartOf: { '@type': 'WebSite', name: 'Okolo', url: publicUrl('') },
};

export default function MethodologyPage() {
  return (
    <main lang="de-AT" className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <div className={`${styles.shell} ${styles.methodShell}`}>
        <OkoloBrand />
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/events">Events</Link> / Arbeitsweise
        </nav>

        <article className={styles.methodArticle}>
          <p className={styles.eyebrow}>Transparenz</p>
          <h1 className={`${styles.title} ${styles.cityTitle}`}>So findet und prüft Okolo Veranstaltungen</h1>
          <p className={styles.intro}>Okolo macht lokale Termine auffindbar, die über viele einzelne Kalender, Gemeindeseiten und Veranstaltungsorte verteilt sind. Herkunft und Unsicherheit bleiben dabei sichtbar.</p>

          <section>
            <h2>1. Lokale und offizielle Quellen</h2>
            <p>Wir verwenden freigegebene Quellen wie Gemeinde- und Stadtseiten, offizielle Kalender von Veranstaltungsorten und Organisatoren sowie andere einzeln geprüfte lokale Quellen. Neue Plattformen werden vor einer wiederholten Erfassung auf Zugriffsregeln, Nutzungsbedingungen und verfügbare Schnittstellen geprüft.</p>
          </section>

          <section>
            <h2>2. Fakten statt kopierter Texte</h2>
            <p>Okolo übernimmt nur Veranstaltungsfakten wie Titel, Datum, Uhrzeit und Ort. Beschreibungen werden eigenständig formuliert; Quelltexte und Bilder werden nicht kopiert. Jeder Eintrag verweist auf die ursprüngliche Veröffentlichung.</p>
          </section>

          <section>
            <h2>3. Keine erfundenen Angaben</h2>
            <p>Unbekannte Uhrzeiten, Preise, Altersangaben oder Adressen bleiben unbekannt. Termine ohne verlässliches Datum werden nicht veröffentlicht. Datums- und Ortsangaben werden, soweit praktisch, mit der sichtbaren Quelle abgeglichen.</p>
          </section>

          <section>
            <h2>4. Laufende Aktualisierung und Korrekturen</h2>
            <p>Wiederkehrende Quellen werden regelmäßig neu geprüft. Abgelaufene Termine verschwinden aus den aktuellen Listen und bleiben gegebenenfalls in redaktionellen Archiven erreichbar. Besucher können strukturierte Hinweise zu Absage, falscher Uhrzeit oder falschen Angaben melden.</p>
          </section>

          <section>
            <h2>5. Linz zuerst</h2>
            <p>Für Linz zeigt die Suche zuerst Termine im Stadtgebiet und danach Veranstaltungen im klar bezeichneten Umkreis. Der Schwerpunkt liegt auf vollständiger, familienfreundlicher regionaler Abdeckung statt auf möglichst vielen beliebigen Seiten.</p>
          </section>

          <div className={styles.methodActions}>
            <Link href="/events/linz/wochenende" className={styles.primaryAction}>Dieses Wochenende in Linz →</Link>
            <Link href="/events/linz/kinder" className={styles.secondaryAction}>Kinderveranstaltungen in Linz →</Link>
          </div>

          <p className={styles.methodContact}>Fragen oder Hinweise: <a href="mailto:hello@okolo.events">hello@okolo.events</a></p>
        </article>
      </div>
    </main>
  );
}
