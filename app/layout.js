import './globals.css';

export const metadata = {
  title: 'Umkreis — Events rund um Linz',
  description: 'Familien-Events und lokale Veranstaltungen rund um Linz auf einer Karte.',
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
