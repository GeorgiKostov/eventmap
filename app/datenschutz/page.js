import { headers } from 'next/headers';
import Link from 'next/link';

const COPY = {
  de: {
    title: 'Datenschutzerklärung', description: 'Datenschutzerklärung für Okolo — welche Daten wir verarbeiten und warum.',
    intro: 'Kurz gesagt: keine Accounts, keine Werbe-Cookies, so wenig Daten wie möglich — und EU-gehostet, wo es geht.', controller: 'Verantwortlicher',
    processing: 'Was wir verarbeiten', processingItems: [
      <><b>Keine Nutzerkonten.</b> Du kannst Okolo ohne Anmeldung nutzen.</>,
      <><b>Server-Logs & Missbrauchsschutz.</b> Beim Aufruf fällt technisch bedingt deine IP-Adresse an (bei unserem Hoster). Für die Begrenzung von Spam bei anonymen Einträgen speichern wir ausschließlich einen <b>gehashten</b> IP-Wert, nie die IP selbst.</>,
      <><b>Sprache.</b> Beim ersten Aufruf wählen wir anhand des von unserem Hoster bereitgestellten ungefähren IP-Ländercodes Deutsch, Bulgarisch oder Englisch. Deine manuelle Auswahl speichern wir in einem notwendigen First-Party-Cookie und im lokalen Speicher.</>,
      <><b>Nutzungsstatistik.</b> Wir nutzen PostHog (EU-Hosting), um anonym und aggregiert zu verstehen, wie Okolo verwendet wird. Kein Autocapture, keine Session-Aufzeichnung, „Do Not Track“ wird respektiert.</>,
      <><b>Newsletter.</b> Nur wenn du dich anmeldest, speichern wir deine E-Mail-Adresse sowie – zur regionalen Auswahl der Events – die gewählte Ortsbezeichnung und deren ungefähre Mittelpunkt-Koordinaten (nicht dein Gerätestandort), deine gewählten Kategorien und deine Sprache. Wir nutzen Double-Opt-in: die Anmeldung ist erst nach Klick auf den Bestätigungslink aktiv. Abmeldung jederzeit über den Link in jeder E-Mail.</>,
      <><b>Deine Beiträge.</b> Wenn du ein Event/einen Ort hinzufügst oder ein Poster scannst, verarbeiten wir die eingegebenen Inhalte und das Foto. Der veröffentlichte Eintrag wird öffentlich auf der Karte sichtbar.</>,
      <><b>Standort.</b> „Meinen Standort finden“ verwendet die Standortfreigabe deines Browsers, um die Karte zu zentrieren. Dieser Standort wird nicht an uns übertragen, außer du gibst bei einem Eintrag bewusst Koordinaten an. Bei der Ortssuche wird deine Eingabe an den Geocoding-Dienst übermittelt.</>,
    ], legal: 'Rechtsgrundlagen', legalItems: ['Betrieb, Sicherheit, Missbrauchsschutz und Sprachauswahl: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).', 'Anonyme Nutzungsstatistik: berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO), datensparsam konfiguriert.', 'Newsletter und Veröffentlichung deiner Beiträge: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), jederzeit widerrufbar.'],
    recipients: 'Empfänger & Auftragsverarbeiter', recipientsItems: [<><b>Vercel</b> — Hosting der Website (USA; Standardvertragsklauseln) und Bereitstellung des ungefähren IP-Ländercodes.</>, <><b>Supabase</b> — Datenbank, EU-Region.</>, <><b>PostHog</b> — anonyme Nutzungsstatistik, EU-Hosting.</>, <><b>Google (Gemini) bzw. Anthropic (Claude)</b> — nur zur Texterkennung aus einem hochgeladenen Poster (USA; Standardvertragsklauseln). Das Foto wird direkt danach gelöscht.</>, <><b>OpenStreetMap / OpenFreeMap</b> (Kartenkacheln) sowie <b>Nominatim / Photon</b> (Geocoding) — erhalten bei Karten- bzw. Suchanfragen die technisch nötigen Daten.</>],
    retention: 'Speicherdauer', retentionText: 'Gehashte IP-Werte für den Missbrauchsschutz werden kurzfristig vorgehalten. Poster-Fotos werden unmittelbar nach der Texterkennung gelöscht. Veröffentlichte Einträge bleiben, bis sie ablaufen oder entfernt werden. Newsletter-Daten bleiben bis zu deiner Abmeldung; deine Spracheinstellung bis du sie löschst oder 12 Monate lang nicht erneuerst.',
    storage: 'Cookies / lokaler Speicher', storageText: 'Wir setzen keine Werbe-Cookies. Ein notwendiges First-Party-Cookie und der lokale Speicher merken deine manuell gewählte Sprache. Außerdem kann eine anonyme Statistik-Kennung im lokalen Speicher abgelegt werden.',
    rights: 'Deine Rechte', rightsText: <>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf einer Einwilligung. Schreib an <a href="mailto:hello@okolo.events">hello@okolo.events</a>. Du kannst dich außerdem bei der österreichischen Datenschutzbehörde beschweren (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).</>, updated: 'Stand: Juli 2026', country: 'Österreich',
  },
  en: {
    title: 'Privacy Policy', description: 'Okolo Privacy Policy — what data we process and why.',
    intro: 'In short: no accounts, no advertising cookies, as little data as possible, and EU hosting where feasible.', controller: 'Controller',
    processing: 'What we process', processingItems: [
      <><b>No user accounts.</b> You can use Okolo without signing in.</>,
      <><b>Server logs & abuse prevention.</b> Our host necessarily receives your IP address when you visit. To limit spam in anonymous submissions, we store only a <b>hashed</b> IP value, never the IP address itself.</>,
      <><b>Language.</b> On your first visit, we use the approximate IP country code supplied by our host to select German, Bulgarian or English. We store your manual choice in a necessary first-party cookie and local storage.</>,
      <><b>Usage analytics.</b> We use PostHog (EU hosting) to understand Okolo through anonymous, aggregated statistics. Autocapture and session recording are disabled, and “Do Not Track” is respected.</>,
      <><b>Newsletter.</b> If you subscribe, we store your email address and — to select events for your region — the chosen locality label and its approximate centre coordinates (not your device location), your chosen categories, and your language. We use double opt-in: the subscription is only active after you click the confirmation link. Unsubscribe anytime via the link in every email.</>,
      <><b>Your submissions.</b> If you add an event/place or scan a poster, we process the content you enter and the photo. The published listing is publicly visible on the map.</>,
      <><b>Location.</b> “Find my location” uses your browser’s permission to centre the map. The location is not sent to us unless you intentionally provide coordinates for a listing. Location searches are sent to the geocoding service.</>,
    ], legal: 'Legal bases', legalItems: ['Operation, security, abuse prevention and language selection: legitimate interests (Art. 6(1)(f) GDPR).', 'Anonymous usage analytics: legitimate interests (Art. 6(1)(f) GDPR), configured to minimise data.', 'Newsletter and publication of your submissions: your consent (Art. 6(1)(a) GDPR), withdrawable at any time.'],
    recipients: 'Recipients & processors', recipientsItems: [<><b>Vercel</b> — website hosting (USA; Standard Contractual Clauses) and provision of the approximate IP country code.</>, <><b>Supabase</b> — database, EU region.</>, <><b>PostHog</b> — anonymous usage analytics, EU hosting.</>, <><b>Google (Gemini) or Anthropic (Claude)</b> — only to recognise text in a poster you upload (USA; Standard Contractual Clauses). The photo is deleted immediately afterwards.</>, <><b>OpenStreetMap / OpenFreeMap</b> (map tiles) and <b>Nominatim / Photon</b> (geocoding) receive the data technically required for map and search requests.</>],
    retention: 'Retention', retentionText: 'Hashed IP values used for abuse prevention are retained briefly. Poster photos are deleted immediately after recognition. Published listings remain until they expire or are removed. Newsletter data remains until you unsubscribe; your language preference remains until you delete it or it is not renewed for 12 months.',
    storage: 'Cookies / local storage', storageText: 'We use no advertising cookies. A necessary first-party cookie and local storage remember your manual language choice. An anonymous analytics identifier may also be stored locally.',
    rights: 'Your rights', rightsText: <>You have rights of access, correction, deletion, restriction, data portability and objection, and may withdraw consent at any time. Email <a href="mailto:hello@okolo.events">hello@okolo.events</a>. You may also complain to the Austrian Data Protection Authority (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).</>, updated: 'Last updated: July 2026', country: 'Austria',
  },
  bg: {
    title: 'Политика за поверителност', description: 'Политика за поверителност на Okolo — какви данни обработваме и защо.',
    intro: 'Накратко: без профили, без рекламни бисквитки, възможно най-малко данни и хостинг в ЕС, когато е възможно.', controller: 'Администратор',
    processing: 'Какво обработваме', processingItems: [
      <><b>Без потребителски профили.</b> Можеш да използваш Okolo без регистрация.</>,
      <><b>Сървърни логове и защита от злоупотреби.</b> При посещение хостинг доставчикът ни технически получава IP адреса ти. За ограничаване на спама при анонимни публикации съхраняваме само <b>хеширана</b> стойност, никога самия IP адрес.</>,
      <><b>Език.</b> При първото посещение използваме приблизителния код на държавата по IP, предоставен от хостинг доставчика, за да изберем немски, български или английски. Ръчният ти избор се пази в необходима бисквитка от първа страна и в локалното хранилище.</>,
      <><b>Статистика за ползването.</b> Използваме PostHog (хостинг в ЕС) за анонимна и обобщена статистика. Автоматичното събиране и записът на сесии са изключени, а “Do Not Track” се спазва.</>,
      <><b>Бюлетин.</b> Ако се абонираш, пазим имейл адреса ти, както и — за да подбираме събития за твоя район — избраното име на населено място и приблизителните му централни координати (не местоположението на устройството ти), избраните категории и езика ти. Използваме двойно потвърждение (double opt-in): абонаментът е активен само след клик върху линка за потвърждение. Можеш да се отпишеш по всяко време чрез линка във всеки имейл.</>,
      <><b>Твоите публикации.</b> Ако добавиш събитие/място или сканираш плакат, обработваме въведеното съдържание и снимката. Публикуваният запис се вижда публично на картата.</>,
      <><b>Местоположение.</b> „Намери местоположението ми“ използва разрешението на браузъра, за да центрира картата. Местоположението не се изпраща до нас, освен ако съзнателно не добавиш координати към публикация. Търсенията на места се изпращат до услугата за геокодиране.</>,
    ], legal: 'Правни основания', legalItems: ['Работа на услугата, сигурност, защита от злоупотреби и избор на език: легитимен интерес (чл. 6, пар. 1, б. „е“ от ОРЗД).', 'Анонимна статистика: легитимен интерес (чл. 6, пар. 1, б. „е“ от ОРЗД), с минимизиране на данните.', 'Бюлетин и публикуване на твоите записи: твоето съгласие (чл. 6, пар. 1, б. „а“ от ОРЗД), което можеш да оттеглиш по всяко време.'],
    recipients: 'Получатели и обработващи', recipientsItems: [<><b>Vercel</b> — хостинг на сайта (САЩ; стандартни договорни клаузи) и предоставяне на приблизителния код на държавата по IP.</>, <><b>Supabase</b> — база данни в регион на ЕС.</>, <><b>PostHog</b> — анонимна статистика, хостинг в ЕС.</>, <><b>Google (Gemini) или Anthropic (Claude)</b> — само за разпознаване на текст от качен плакат (САЩ; стандартни договорни клаузи). Снимката се изтрива веднага след това.</>, <><b>OpenStreetMap / OpenFreeMap</b> (карта) и <b>Nominatim / Photon</b> (геокодиране) получават технически необходимите данни при заявки към картата и търсачката.</>],
    retention: 'Срок на съхранение', retentionText: 'Хешираните IP стойности за защита от злоупотреби се пазят за кратко. Снимките на плакати се изтриват веднага след разпознаването. Публикациите остават, докато изтекат или бъдат премахнати. Данните за бюлетина остават до отписване; езиковата настройка — докато я изтриеш или ако не бъде подновена 12 месеца.',
    storage: 'Бисквитки / локално хранилище', storageText: 'Не използваме рекламни бисквитки. Необходима бисквитка от първа страна и локалното хранилище помнят ръчния ти избор на език. Възможно е локално да се пази и анонимен идентификатор за статистика.',
    rights: 'Твоите права', rightsText: <>Имаш право на достъп, коригиране, изтриване, ограничаване, преносимост и възражение, както и да оттеглиш съгласие по всяко време. Пиши на <a href="mailto:hello@okolo.events">hello@okolo.events</a>. Можеш да подадеш жалба и до австрийския орган за защита на данните (<a href="https://www.dsb.gv.at" target="_blank" rel="noopener noreferrer">dsb.gv.at</a>).</>, updated: 'Актуализирано: юли 2026 г.', country: 'Австрия',
  },
};

async function copy() {
  const lang = (await headers()).get('x-okolo-lang');
  return COPY[lang] || COPY.en;
}

export async function generateMetadata() {
  const t = await copy();
  return { title: t.title, description: t.description, robots: { index: true, follow: true } };
}

export default async function DatenschutzPage() {
  const t = await copy();
  return (
    <div className="legalpage">
      <Link href="/" className="home">← Okolo</Link>
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
