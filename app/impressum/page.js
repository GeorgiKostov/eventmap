import Link from 'next/link';

export const metadata = {
  title: 'Impressum',
  description: 'Offenlegung und Anbieterkennzeichnung für Okolo, gemäß §5 ECG und §25 MedienG (Österreich).',
  robots: { index: true, follow: true },
};

export default function ImpressumPage() {
  return (
    <div className="legalpage">
      <Link href="/" className="home">← Okolo</Link>
      <h1>Impressum</h1>
      <p className="sub">Informationen gemäß §5 E-Commerce-Gesetz (ECG) und §25 Mediengesetz (Österreich).</p>

      <h2>Medieninhaber &amp; Diensteanbieter</h2>
      <p>
        Georgi Kostov<br />
        Breitwiesenstraße 22, Tür 7<br />
        4481 Asten<br />
        Österreich
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href="mailto:hello@okolo.events">hello@okolo.events</a>
      </p>

      <h2>Unternehmensdaten</h2>
      <p>
        Einzelunternehmen, freies Gewerbe<br />
        UID: ATU79242428<br />
        GISA: 39761774 · Gewerbebehörde: Bezirkshauptmannschaft Linz-Land<br />
        Mitglied der Wirtschaftskammer Österreich (WKO)<br />
        Gewerberecht: Gewerbeordnung (GewO), <a href="https://www.ris.bka.gv.at" target="_blank" rel="noopener noreferrer">ris.bka.gv.at</a>
      </p>

      <h2>Unternehmensgegenstand</h2>
      <p>Okolo ist eine Karte für lokale Veranstaltungen und familienfreundliche Orte in Österreich. Veranstaltungsdaten stammen aus offiziellen kommunalen Quellen sowie von Nutzer:innen; jeder Eintrag verlinkt auf seine Originalquelle.</p>

      <h2>Online-Streitbeilegung</h2>
      <p className="muted">
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>.
        Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte &amp; Links</h2>
      <p className="muted">Okolo indexiert Fakten (Titel, Datum, Ort) öffentlicher Veranstaltungen und verlinkt auf die jeweilige Originalquelle. Für die Inhalte verlinkter externer Seiten ist deren jeweiliger Betreiber verantwortlich. Sollte ein Eintrag fehlerhaft sein oder Rechte verletzen, kontaktiere uns unter <a href="mailto:hello@okolo.events">hello@okolo.events</a> — wir entfernen ihn umgehend.</p>

      <p className="updated">Stand: Juli 2026</p>
    </div>
  );
}
