import { headers } from 'next/headers';
import OkoloBrand from '../okolo-brand.js';

const COPY = {
  de: {
    title: 'Datenschutzerklärung', description: 'Datenschutzerklärung für Okolo — welche Daten wir verarbeiten und warum.',
    intro: 'Kurz gesagt: Okolo funktioniert ohne Account oder Anmeldung. Keine Werbe-Cookies, so wenig Daten wie möglich — und EU-gehostet, wo es geht.', controller: 'Verantwortlicher',
    processing: 'Was wir verarbeiten', processingItems: [
      <><b>Server-Logs & Missbrauchsschutz.</b> Beim Aufruf fällt technisch bedingt deine IP-Adresse an (bei unserem Hoster). Für die Begrenzung von Missbrauch (z. B. Newsletter-Anmeldungen und Fehlermeldungen zu Events) speichern wir ausschließlich einen <b>gehashten</b> IP-Wert, nie die IP selbst.</>,
      <><b>Sprache.</b> Beim ersten Aufruf wählen wir anhand des von unserem Hoster bereitgestellten ungefähren IP-Ländercodes Deutsch, Bulgarisch oder Englisch. Deine manuelle Auswahl speichern wir in einem notwendigen First-Party-Cookie und im lokalen Speicher.</>,
      <><b>Nutzungsstatistik.</b> Nur mit deiner freiwilligen Einwilligung senden wir einfache Seiten- und Klickstatistiken an PostHog (EU-Hosting). Keine Aufzeichnungen, Suchtexte oder genauen Standorte. Do Not Track und Global Privacy Control werden respektiert. Über die Datenschutzeinstellungen kannst du jederzeit ablehnen oder widerrufen.</>,
      <><b>Newsletter & Stadt-Benachrichtigung.</b> Wenn du dich anmeldest, speichern wir deine E-Mail-Adresse, die gewählte Newsletter-Ausgabe oder Ortsbezeichnung mit ungefähren Mittelpunkt-Koordinaten (nicht deinen Gerätestandort) und deine Sprache. Für eine verfügbare Ausgabe erhältst du den Wochenend-Newsletter; für eine noch nicht verfügbare Stadt nur eine einmalige Nachricht, sobald dort eine Ausgabe startet. Beides nutzt Double-Opt-in und wird erst nach Klick auf den Bestätigungslink aktiv. Als Nachweis deiner Einwilligung speichern wir Zeitpunkt und Version des Einwilligungstextes sowie einen gehashten IP-Wert (nie die IP selbst). Auswahl ändern oder abmelden kannst du über den Link in jeder E-Mail.</>,
      <><b>Merkliste.</b> Deine Merkliste bleibt nur im lokalen Speicher dieses Geräts; wir speichern sie nicht.</>,
      <><b>Standort.</b> „Meinen Standort finden“ verwendet die Standortfreigabe deines Browsers, um die Karte zu zentrieren. Dieser Standort wird nicht an uns übertragen. Bei der Ortssuche wird deine Eingabe an den Geocoding-Dienst übermittelt.</>,
    ], legal: 'Rechtsgrundlagen', legalItems: ['Betrieb, Sicherheit, Missbrauchsschutz und Sprachauswahl: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).', 'Optionale Nutzungsstatistik: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), jederzeit widerrufbar.', 'Newsletter: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), jederzeit widerrufbar.'],
    recipients: 'Empfänger & Auftragsverarbeiter', recipientsItems: [<><b>Vercel</b> — Hosting der Website (USA; Standardvertragsklauseln) und Bereitstellung des ungefähren IP-Ländercodes.</>, <><b>Neon</b> — Datenbank, EU-Region (Standardvertragsklauseln).</>, <><b>PostHog</b> — anonyme Nutzungsstatistik, EU-Hosting.</>, <><b>OpenStreetMap / OpenFreeMap</b> (Kartenkacheln) sowie <b>Nominatim / Photon</b> (Geocoding) — erhalten bei Karten- bzw. Suchanfragen die technisch nötigen Daten.</>],
    retention: 'Speicherdauer', retentionText: 'Gehashte IP-Werte für den Missbrauchsschutz werden kurzfristig vorgehalten. Newsletter-Daten bleiben bis zu deiner Abmeldung; deine Spracheinstellung bis du sie löschst oder 12 Monate lang nicht erneuerst.',
    storage: 'Cookies / lokaler Speicher', storageText: 'Wir setzen keine Werbe-Cookies. Ein notwendiges First-Party-Cookie hält deine Sprachwahl. Der lokale Speicher merkt Sprache und Merkliste; gespeichert wird auch deine Statistik-Auswahl. Eine zufällige Statistik-Kennung bleibt nur im Arbeitsspeicher bis zum Neuladen oder Widerruf.',
    rights: 'Deine Rechte', rightsText: <>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf einer Einwilligung. Schreib an <a href="mailto:hello@okolo.events">hello@okolo.events</a>. Du kannst dich außerdem bei der österreichischen Datenschutzbehörde beschweren (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).</>, updated: 'Stand: November 2026', country: 'Österreich',
  },
  en: {
    title: 'Privacy Policy', description: 'Okolo Privacy Policy — what data we process and why.',
    intro: 'In short: Okolo works without an account or sign-in. No advertising cookies, as little data as possible, and EU hosting where feasible.', controller: 'Controller',
    processing: 'What we process', processingItems: [
      <><b>Server logs & abuse prevention.</b> Our host necessarily receives your IP address when you visit. To limit abuse (for example newsletter sign-ups and event problem reports), we store only a <b>hashed</b> IP value, never the IP address itself.</>,
      <><b>Language.</b> On your first visit, we use the approximate IP country code supplied by our host to select German, Bulgarian or English. We store your manual choice in a necessary first-party cookie and local storage.</>,
      <><b>Usage analytics.</b> Only with your optional consent do we send basic page and button statistics to PostHog (EU hosting). No recordings, search text or precise location. Do Not Track and Global Privacy Control are respected. Reject or withdraw at any time through Privacy settings.</>,
      <><b>Newsletter & city notification.</b> If you sign up, we store your email address, selected newsletter edition or locality with its approximate centre coordinates (not your device location), and language. For an available edition you receive the weekend newsletter; for a city not yet available you receive only one notification when an edition launches there. Both use double opt-in and become active only after you click the confirmation link. As proof of consent we store its time and wording version plus a hashed IP value (never the IP itself). Change your selection or unsubscribe through the link in every email.</>,
      <><b>Saved events.</b> Your saved list stays only in this device’s local storage; we do not store it.</>,
      <><b>Location.</b> “Find my location” uses your browser’s permission to centre the map. The location is not sent to us. Location searches are sent to the geocoding service.</>,
    ], legal: 'Legal bases', legalItems: ['Operation, security, abuse prevention and language selection: legitimate interests (Art. 6(1)(f) GDPR).', 'Optional usage analytics: your consent (Art. 6(1)(a) GDPR), withdrawable at any time.', 'Newsletter: your consent (Art. 6(1)(a) GDPR), withdrawable at any time.'],
    recipients: 'Recipients & processors', recipientsItems: [<><b>Vercel</b> — website hosting (USA; Standard Contractual Clauses) and provision of the approximate IP country code.</>, <><b>Neon</b> — database, EU region (Standard Contractual Clauses).</>, <><b>PostHog</b> — anonymous usage analytics, EU hosting.</>, <><b>OpenStreetMap / OpenFreeMap</b> (map tiles) and <b>Nominatim / Photon</b> (geocoding) receive the data technically required for map and search requests.</>],
    retention: 'Retention', retentionText: 'Hashed IP values used for abuse prevention are retained briefly. Newsletter data remains until you unsubscribe; your language preference remains until you delete it or it is not renewed for 12 months.',
    storage: 'Cookies / local storage', storageText: 'We use no advertising cookies. A necessary first-party cookie keeps your language choice. Local storage remembers your language and saved list; we also remember your statistics choice. A random analytics identifier stays only in memory until reload or withdrawal.',
    rights: 'Your rights', rightsText: <>You have rights of access, correction, deletion, restriction, data portability and objection, and may withdraw consent at any time. Email <a href="mailto:hello@okolo.events">hello@okolo.events</a>. You may also complain to the Austrian Data Protection Authority (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).</>, updated: 'Last updated: November 2026', country: 'Austria',
  },
  bg: {
    title: 'Политика за поверителност', description: 'Политика за поверителност на Okolo — какви данни обработваме и защо.',
    intro: 'Накратко: Okolo работи без профил и вход. Без рекламни бисквитки, възможно най-малко данни и хостинг в ЕС, когато е възможно.', controller: 'Администратор',
    processing: 'Какво обработваме', processingItems: [
      <><b>Сървърни логове и защита от злоупотреби.</b> При посещение хостинг доставчикът ни технически получава IP адреса ти. За ограничаване на злоупотреби (напр. абонаменти за бюлетина и сигнали за грешки в събития) съхраняваме само <b>хеширана</b> стойност, никога самия IP адрес.</>,
      <><b>Език.</b> При първото посещение използваме приблизителния код на държавата по IP, предоставен от хостинг доставчика, за да изберем немски, български или английски. Ръчният ти избор се пази в необходима бисквитка от първа страна и в локалното хранилище.</>,
      <><b>Статистика за ползването.</b> Само с твоето доброволно съгласие изпращаме основни посещения и кликове към PostHog (хостинг в ЕС). Без записи, търсения или точно местоположение. Спазваме Do Not Track и Global Privacy Control. Отказ или оттегляне са достъпни по всяко време в настройките за поверителност.</>,
      <><b>Бюлетин и известие за град.</b> Ако се регистрираш, пазим имейл адреса ти, избраното издание на бюлетина или населено място с приблизителните му централни координати (не местоположението на устройството ти), и езика ти. За налично издание получаваш уикенд бюлетина; за град, който още не е наличен, получаваш само едно известие при старта му. И двете използват двойно потвърждение и стават активни само след клик върху линка. Като доказателство за съгласието пазим момента и версията на текста, както и хеширана стойност на IP адреса (никога самия IP). Можеш да промениш избора си или да се отпишеш чрез линка във всеки имейл.</>,
      <><b>Запазени събития.</b> Списъкът остава само в локалното хранилище на устройството; ние не го съхраняваме.</>,
      <><b>Местоположение.</b> „Намери местоположението ми“ използва разрешението на браузъра, за да центрира картата. Местоположението не се изпраща до нас. Търсенията на места се изпращат до услугата за геокодиране.</>,
    ], legal: 'Правни основания', legalItems: ['Работа на услугата, сигурност, защита от злоупотреби и избор на език: легитимен интерес (чл. 6, пар. 1, б. „е“ от ОРЗД).', 'Статистика по избор: твоето съгласие (чл. 6, пар. 1, б. „а“ от ОРЗД), което можеш да оттеглиш по всяко време.', 'Бюлетин: твоето съгласие (чл. 6, пар. 1, б. „а“ от ОРЗД), което можеш да оттеглиш по всяко време.'],
    recipients: 'Получатели и обработващи', recipientsItems: [<><b>Vercel</b> — хостинг на сайта (САЩ; стандартни договорни клаузи) и предоставяне на приблизителния код на държавата по IP.</>, <><b>Neon</b> — база данни, регион в ЕС (стандартни договорни клаузи).</>, <><b>PostHog</b> — анонимна статистика, хостинг в ЕС.</>, <><b>OpenStreetMap / OpenFreeMap</b> (карта) и <b>Nominatim / Photon</b> (геокодиране) получават технически необходимите данни при заявки към картата и търсачката.</>],
    retention: 'Срок на съхранение', retentionText: 'Хешираните IP стойности за защита от злоупотреби се пазят за кратко. Данните за бюлетина остават до отписване; езиковата настройка — докато я изтриеш или ако не бъде подновена 12 месеца.',
    storage: 'Бисквитки / локално хранилище', storageText: 'Не използваме рекламни бисквитки. Необходима бисквитка от първа страна пази избора на език. Локалното хранилище помни езика и запазения списък; пазим и избора ти за статистика. Случаен идентификатор остава само в паметта до презареждане или оттегляне.',
    rights: 'Твоите права', rightsText: <>Имаш право на достъп, коригиране, изтриване, ограничаване, преносимост и възражение, както и да оттеглиш съгласие по всяко време. Пиши на <a href="mailto:hello@okolo.events">hello@okolo.events</a>. Можеш да подадеш жалба и до австрийския орган за защита на данните (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).</>, updated: 'Актуализирано: ноември 2026 г.', country: 'Австрия',
  },
};

async function copy() {
  const lang = (await headers()).get('x-okolo-lang');
  return COPY[lang] || COPY.en;
}

export async function generateMetadata() {
  const t = await copy();
  return { title: t.title, description: t.description, robots: { index: true, follow: true }, alternates: { canonical: '/datenschutz' } };
}

export default async function DatenschutzPage() {
  const t = await copy();
  return (
    <div className="legalpage">
      <OkoloBrand />
      <h1>{t.title}</h1><p className="sub">{t.intro}</p>
      <h2>{t.controller}</h2><p>Georgi Kostov, Breitwiesenstraße 22, Tür 7, 4481 Asten, {t.country}<br /><a href="mailto:hello@okolo.events">hello@okolo.events</a></p>
      <h2>{t.processing}</h2><ul>{t.processingItems.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <h2>{t.legal}</h2><ul>{t.legalItems.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <h2>{t.recipients}</h2><ul>{t.recipientsItems.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <h2>{t.retention}</h2><p>{t.retentionText}</p>
      <h2>{t.storage}</h2><p>{t.storageText}</p>
      <h2>{t.rights}</h2><p>{t.rightsText}</p>
      <p className="updated">{t.updated}</p>
    </div>
  );
}
