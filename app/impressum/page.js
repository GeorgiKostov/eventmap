import { headers } from 'next/headers';
import Link from 'next/link';

const COPY = {
  de: {
    title: 'Impressum', description: 'Offenlegung und Anbieterkennzeichnung für Okolo, gemäß §5 ECG und §25 MedienG (Österreich).',
    intro: 'Informationen gemäß §5 E-Commerce-Gesetz (ECG) und §25 Mediengesetz (Österreich).',
    owner: 'Medieninhaber & Diensteanbieter', contact: 'Kontakt', email: 'E-Mail', company: 'Unternehmensdaten',
    companyLines: <>Einzelunternehmen, freies Gewerbe<br />UID: ATU79242428<br />GISA: 39761774 · Gewerbebehörde: Bezirkshauptmannschaft Linz-Land<br />Mitglied der Wirtschaftskammer Österreich (WKO)<br />Gewerberecht: Gewerbeordnung (GewO), <a href="https://www.ris.bka.gv.at" target="_blank" rel="noopener noreferrer">ris.bka.gv.at</a></>,
    purposeTitle: 'Unternehmensgegenstand', purpose: 'Okolo ist eine Karte für lokale Veranstaltungen und familienfreundliche Orte in Österreich. Veranstaltungsdaten stammen aus offiziellen kommunalen Quellen sowie von Nutzer:innen; jeder Eintrag verlinkt auf seine Originalquelle.',
    disputeTitle: 'Online-Streitbeilegung', dispute: <>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}<a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>. Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</>,
    liabilityTitle: 'Haftung für Inhalte & Links', liability: <>Okolo indexiert Fakten (Titel, Datum, Ort) öffentlicher Veranstaltungen und verlinkt auf die jeweilige Originalquelle. Für die Inhalte verlinkter externer Seiten ist deren jeweiliger Betreiber verantwortlich. Sollte ein Eintrag fehlerhaft sein oder Rechte verletzen, kontaktiere uns unter <a href="mailto:hello@okolo.events">hello@okolo.events</a> — wir entfernen ihn umgehend.</>,
    updated: 'Stand: Juli 2026', country: 'Österreich',
  },
  en: {
    title: 'Legal notice', description: 'Legal disclosure and provider information for Okolo under Austrian law.',
    intro: 'Information pursuant to §5 of the Austrian E-Commerce Act (ECG) and §25 of the Austrian Media Act.',
    owner: 'Media owner & service provider', contact: 'Contact', email: 'Email', company: 'Company details',
    companyLines: <>Sole proprietorship, unregulated trade<br />VAT ID: ATU79242428<br />GISA: 39761774 · Trade authority: Linz-Land District Authority<br />Member of the Austrian Federal Economic Chamber (WKO)<br />Trade law: Austrian Trade Regulation Act (GewO), <a href="https://www.ris.bka.gv.at" target="_blank" rel="noopener noreferrer">ris.bka.gv.at</a></>,
    purposeTitle: 'Business purpose', purpose: 'Okolo is a map of local events and family-friendly places in Austria. Event data comes from official municipal sources and users; every listing links to its original source.',
    disputeTitle: 'Online dispute resolution', dispute: <>The European Commission provides an online dispute resolution platform:{' '}<a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>. We are neither obliged nor willing to participate in dispute resolution proceedings before a consumer arbitration board.</>,
    liabilityTitle: 'Liability for content & links', liability: <>Okolo indexes facts about public events (title, date and place) and links to the respective original source. The operators of linked external websites are responsible for their content. If a listing is inaccurate or infringes rights, contact us at <a href="mailto:hello@okolo.events">hello@okolo.events</a> and we will remove it promptly.</>,
    updated: 'Last updated: July 2026', country: 'Austria',
  },
  bg: {
    title: 'Правна информация', description: 'Правна информация за Okolo съгласно австрийското законодателство.',
    intro: 'Информация съгласно §5 от австрийския Закон за електронната търговия (ECG) и §25 от Закона за медиите.',
    owner: 'Собственик на медията и доставчик на услугата', contact: 'Контакт', email: 'Имейл', company: 'Фирмени данни',
    companyLines: <>Едноличен търговец, свободна стопанска дейност<br />ДДС номер: ATU79242428<br />GISA: 39761774 · Търговски орган: Окръжна администрация Линц-Ланд<br />Член на Австрийската стопанска камара (WKO)<br />Търговско право: Австрийски закон за търговската дейност (GewO), <a href="https://www.ris.bka.gv.at" target="_blank" rel="noopener noreferrer">ris.bka.gv.at</a></>,
    purposeTitle: 'Предмет на дейност', purpose: 'Okolo е карта на местни събития и подходящи за семейства места в Австрия. Данните идват от официални общински източници и потребители; всяка публикация води към оригиналния си източник.',
    disputeTitle: 'Онлайн решаване на спорове', dispute: <>Европейската комисия предоставя платформа за онлайн решаване на спорове:{' '}<a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a>. Не сме задължени и не желаем да участваме в процедури за решаване на спорове пред потребителска арбитражна комисия.</>,
    liabilityTitle: 'Отговорност за съдържание и връзки', liability: <>Okolo индексира факти за публични събития (заглавие, дата и място) и води към съответния оригинален източник. Операторите на външните сайтове носят отговорност за тяхното съдържание. Ако публикация е неточна или нарушава права, пиши ни на <a href="mailto:hello@okolo.events">hello@okolo.events</a> и ще я премахнем своевременно.</>,
    updated: 'Актуализирано: юли 2026 г.', country: 'Австрия',
  },
};

async function copy() {
  const lang = (await headers()).get('x-okolo-lang');
  return COPY[lang] || COPY.en;
}

export async function generateMetadata() {
  const t = await copy();
  return { title: t.title, description: t.description, robots: { index: true, follow: true }, alternates: { canonical: '/impressum' } };
}

export default async function ImpressumPage() {
  const t = await copy();
  return (
    <div className="legalpage">
      <Link href="/" className="home">← Okolo</Link>
      <h1>{t.title}</h1>
      <p className="sub">{t.intro}</p>
      <h2>{t.owner}</h2>
      <p>Georgi Kostov<br />Breitwiesenstraße 22, Tür 7<br />4481 Asten<br />{t.country}</p>
      <h2>{t.contact}</h2>
      <p>{t.email}: <a href="mailto:hello@okolo.events">hello@okolo.events</a></p>
      <h2>{t.company}</h2>
      <p>{t.companyLines}</p>
      <h2>{t.purposeTitle}</h2><p>{t.purpose}</p>
      <h2>{t.disputeTitle}</h2><p className="muted">{t.dispute}</p>
      <h2>{t.liabilityTitle}</h2><p className="muted">{t.liability}</p>
      <p className="updated">{t.updated}</p>
    </div>
  );
}
