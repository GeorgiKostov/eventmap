import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
