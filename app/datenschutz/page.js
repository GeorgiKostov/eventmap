import Link from 'next/link';

export const metadata = {
  title: 'Datenschutz',
  description: 'Datenschutzerklärung für Okolo — welche Daten wir verarbeiten und warum.',
  robots: { index: true, follow: true },
};

export default function DatenschutzPage() {
  return (
    <div className="legalpage">
      <Link href="/" className="home">← Okolo</Link>
      <h1>Datenschutzerklärung</h1>
      <p className="sub">Kurz gesagt: keine Accounts, keine Werbe-Cookies, so wenig Daten wie möglich — und EU-gehostet, wo es geht.</p>

      <h2>Verantwortlicher</h2>
      <p>
        Georgi Kostov, Breitwiesenstraße 22, Tür 7, 4481 Asten, Österreich<br />
        <a href="mailto:hello@okolo.events">hello@okolo.events</a>
      </p>

      <h2>Was wir verarbeiten</h2>
      <ul>
        <li><b>Keine Nutzerkonten.</b> Du kannst Okolo ohne Anmeldung nutzen.</li>
        <li><b>Server-Logs &amp; Missbrauchsschutz.</b> Beim Aufruf fällt technisch bedingt deine IP-Adresse an (bei unserem Hoster). Für die Begrenzung von Spam bei anonymen Einträgen speichern wir ausschließlich einen <b>gehashten</b> IP-Wert, nie die IP selbst.</li>
        <li><b>Nutzungsstatistik.</b> Wir nutzen PostHog (EU-Hosting), um anonym und aggregiert zu verstehen, wie Okolo verwendet wird (z. B. Seitenaufrufe, welche Funktionen genutzt werden). Kein Autocapture, keine Session-Aufzeichnung, „Do Not Track“ wird respektiert.</li>
        <li><b>Newsletter.</b> Nur wenn du dich anmeldest, speichern wir deine E-Mail-Adresse, um dir den Newsletter zu senden. Abmeldung jederzeit möglich.</li>
        <li><b>Deine Beiträge.</b> Wenn du ein Event/einen Ort hinzufügst oder ein Poster scannst, verarbeiten wir die eingegebenen Inhalte (Titel, Datum, Ort, Beschreibung) und das Foto. Der veröffentlichte Eintrag wird öffentlich auf der Karte sichtbar.</li>
        <li><b>Standort.</b> „Meinen Standort finden“ verwendet die Standortfreigabe deines Browsers, um die Karte zu zentrieren — dieser Standort wird nicht an uns übertragen, außer du gibst bei einem Eintrag bewusst Koordinaten an. Bei der Ortssuche wird deine Eingabe an den Geocoding-Dienst übermittelt.</li>
      </ul>

      <h2>Rechtsgrundlagen</h2>
      <ul>
        <li>Betrieb, Sicherheit &amp; Missbrauchsschutz: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).</li>
        <li>Anonyme Nutzungsstatistik: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO), datensparsam konfiguriert.</li>
        <li>Newsletter: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), jederzeit widerrufbar.</li>
        <li>Veröffentlichung deiner Beiträge: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).</li>
      </ul>

      <h2>Empfänger &amp; Auftragsverarbeiter</h2>
      <ul>
        <li><b>Vercel</b> — Hosting der Website (USA; auf Basis von Standardvertragsklauseln).</li>
        <li><b>Supabase</b> — Datenbank, EU-Region.</li>
        <li><b>PostHog</b> — anonyme Nutzungsstatistik, EU-Hosting.</li>
        <li><b>Google (Gemini) bzw. Anthropic (Claude)</b> — nur zur Texterkennung aus einem von dir hochgeladenen Poster (USA; Standardvertragsklauseln). Das Foto wird direkt nach der Erkennung gelöscht.</li>
        <li><b>OpenStreetMap / OpenFreeMap</b> (Kartenkacheln) sowie <b>Nominatim / Photon</b> (Geocoding) — erhalten bei Karten- bzw. Suchanfragen die technisch nötigen Daten.</li>
      </ul>

      <h2>Speicherdauer</h2>
      <p>Gehashte IP-Werte für den Missbrauchsschutz werden kurzfristig vorgehalten. Poster-Fotos werden unmittelbar nach der Texterkennung gelöscht. Veröffentlichte Einträge bleiben, bis sie ablaufen oder entfernt werden. Newsletter-Daten bis zu deiner Abmeldung.</p>

      <h2>Cookies / lokaler Speicher</h2>
      <p>Wir setzen keine Werbe-Cookies. Im lokalen Speicher deines Browsers werden nur eine anonyme Statistik-Kennung sowie App-Einstellungen (z. B. Sprache) abgelegt.</p>

      <h2>Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie das Recht, eine erteilte Einwilligung jederzeit zu widerrufen. Schreib uns dazu an <a href="mailto:hello@okolo.events">hello@okolo.events</a>. Du kannst dich außerdem bei der österreichischen Datenschutzbehörde beschweren (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).</p>

      <p className="updated">Stand: Juli 2026</p>
    </div>
  );
}
