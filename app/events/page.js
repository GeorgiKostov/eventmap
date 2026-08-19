import Link from 'next/link';
import { SEO_CITIES, cityPath } from '../../lib/seo-pages.js';
import { publicUrl } from '../../lib/public-url.js';

export const metadata = {
  title: 'Events in Österreich',
  description: 'Finde aktuelle Veranstaltungen und Ausflugsideen in österreichischen Städten — von Linz und Wien bis Graz, Salzburg und Innsbruck.',
  alternates: { canonical: '/events' },
};

const ld = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Events in Österreich',
  url: publicUrl('events'),
  hasPart: SEO_CITIES.map((city) => ({ '@type': 'WebPage', name: `Events in ${city.label}`, url: publicUrl(cityPath(city)) })),
};

export default function EventsIndex() {
  return (
    <main lang="de-AT" style={{ minHeight: '100vh', background: '#F7F6F1', color: '#212B28', fontFamily: 'system-ui, sans-serif' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '42px 20px 72px' }}>
        <Link href="/" style={{ color: '#212B28', fontSize: 20, fontWeight: 800, textDecoration: 'none' }}>● Okolo</Link>
        <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: '28px 0 10px' }}>Events in Österreich</h1>
        <p style={{ color: '#4A5652', fontSize: 17, lineHeight: 1.6 }}>Entdecke aktuelle Veranstaltungen, Familienprogramm, Märkte, Kultur und Ausflugsideen in deiner Stadt.</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '28px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {SEO_CITIES.map((city) => (
            <li key={city.slug}>
              <Link href={cityPath(city)} style={{ display: 'block', background: '#fff', border: '1px solid #E4E4DD', borderRadius: 14, padding: 18, color: '#C93A5B', fontSize: 18, fontWeight: 750, textDecoration: 'none' }}>
                Events in {city.label} →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
