import { headers } from 'next/headers';
import OkoloBrand from '../../okolo-brand.js';
import { LANGS } from '../../../lib/i18n.js';
import { subscriberPreferences } from '../../../lib/db.js';
import NewsletterPreferencesForm from './preferences-form.js';

export const dynamic = 'force-dynamic';

const COPY = {
  de: { title: 'Newsletter-Ausgabe wählen', intro: 'Wähle Linz & Umgebung oder lass dich einmalig benachrichtigen, wenn Okolo in deiner Stadt startet.', invalid: 'Dieser persönliche Link ist ungültig oder nicht mehr aktiv.' },
  en: { title: 'Choose your newsletter edition', intro: 'Choose Linz & surroundings, or ask us to notify you once when Okolo launches in your city.', invalid: 'This personal link is invalid or no longer active.' },
  bg: { title: 'Избери издание на бюлетина', intro: 'Избери Линц и околността или поискай еднократно известие, когато Okolo стартира в твоя град.', invalid: 'Този личен линк е невалиден или вече не е активен.' },
};

export async function generateMetadata() {
  return { title: 'Newsletter preferences', robots: { index: false, follow: false } };
}

export default async function NewsletterPreferencesPage({ searchParams }) {
  const query = await searchParams;
  const headerLang = (await headers()).get('x-okolo-lang');
  const lang = LANGS.includes(query?.lang) ? query.lang : LANGS.includes(headerLang) ? headerLang : 'en';
  const c = COPY[lang] || COPY.en;
  const token = String(query?.token || '');
  const current = token ? await subscriberPreferences(token) : null;

  return (
    <main className="newsletter-preferences-page">
      <OkoloBrand />
      <section className="newsletter-preferences-card">
        <div className="newsletter-preferences-icon" aria-hidden="true">✉️</div>
        <h1>{c.title}</h1>
        <p>{current ? c.intro : c.invalid}</p>
        {current && <NewsletterPreferencesForm token={token} lang={lang} current={current} />}
      </section>
    </main>
  );
}
