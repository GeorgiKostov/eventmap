import './globals.css';
import { headers } from 'next/headers';
import SWRegister from './sw-register.js';
import Analytics from './analytics.js';
import LanguageProvider from './language-provider.js';
import { LANGS } from '../lib/i18n.js';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events';
const META_COPY = {
  en: { title: 'Okolo — Events around you', description: 'Family events and local happenings near you, on a map. Discover what is on around you.', locale: 'en_GB', keywords: ['Events', 'Local', 'Family', 'Map', 'Nearby', 'Linz', 'Austria'] },
  de: { title: 'Okolo — Events in deiner Nähe', description: 'Familien-Events und lokale Veranstaltungen in deiner Nähe auf einer Karte. Entdecke, was um dich herum passiert.', locale: 'de_AT', keywords: ['Events', 'Lokal', 'Familie', 'Veranstaltungen', 'Karte', 'Umgebung', 'Linz'] },
  bg: { title: 'Okolo — Събития около теб', description: 'Семейни и местни събития около теб на карта. Открий какво се случва наблизо.', locale: 'bg_BG', keywords: ['Събития', 'Локални', 'Семейство', 'Карта', 'Наблизо', 'Линц'] },
};

export async function generateMetadata() {
  const detectedLang = (await headers()).get('x-okolo-lang');
  const copy = META_COPY[detectedLang] || META_COPY.en;
  return {
    metadataBase: new URL(BASE_URL),
    title: { default: copy.title, template: '%s · Okolo' },
    description: copy.description,
    applicationName: 'Okolo',
    keywords: copy.keywords,
    alternates: { canonical: '/' },
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: 'Okolo', statusBarStyle: 'default' },
    other: { 'apple-mobile-web-app-capable': 'yes' },
    openGraph: { type: 'website', locale: copy.locale, url: BASE_URL, siteName: 'Okolo', title: copy.title, description: copy.description },
    twitter: { card: 'summary_large_image', title: copy.title, description: copy.description },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#C93A5B',
};

export default async function RootLayout({ children }) {
  const requestHeaders = await headers();
  const detectedLang = requestHeaders.get('x-okolo-lang');
  const lang = LANGS.includes(detectedLang) ? detectedLang : 'en';
  return (
    <html lang={lang}>
      <body><LanguageProvider initialLang={lang}>{children}</LanguageProvider><SWRegister /><Analytics /></body>
    </html>
  );
}
