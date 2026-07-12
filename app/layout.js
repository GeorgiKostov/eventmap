import './globals.css';
import SWRegister from './sw-register.js';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events';
const TITLE = 'Okolo — Events rund um Linz';
const DESCRIPTION =
  'Familien-Events und lokale Veranstaltungen rund um Linz auf einer Karte. Entdecke, was in deinem Umkreis passiert.';

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: TITLE,
    template: '%s · Okolo',
  },
  description: DESCRIPTION,
  applicationName: 'Okolo',
  keywords: ['Events', 'Linz', 'Oberösterreich', 'Familie', 'Veranstaltungen', 'Karte', 'Umkreis'],
  alternates: { canonical: '/' },
  manifest: '/manifest.webmanifest',
  // iOS "Add to Home Screen" → launch standalone with the Okolo name + status bar.
  appleWebApp: {
    capable: true,
    title: 'Okolo',
    statusBarStyle: 'default',
  },
  // Next emits the modern `mobile-web-app-capable`; add the legacy Apple tag too
  // so older iOS Safari also launches Okolo full-screen from the home screen.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  openGraph: {
    type: 'website',
    locale: 'de_AT',
    url: BASE_URL,
    siteName: 'Okolo',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#C93A5B',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}<SWRegister /></body>
    </html>
  );
}
