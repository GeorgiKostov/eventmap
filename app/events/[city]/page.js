import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { seoEvents } from '../../../lib/db.js';
import { publicUrl } from '../../../lib/public-url.js';
import {
  SEO_CITIES,
  cityPageRange,
  cityPath,
  isIndexableEventCount,
  resolveSeoCity,
} from '../../../lib/seo-pages.js';
import SeoEventPage, { collectionJsonLd } from '../seo-page.js';

export const revalidate = 3600;

export function generateStaticParams() {
  return SEO_CITIES.map((city) => ({ city: city.slug }));
}

const load = cache(async (slug) => {
  const resolved = resolveSeoCity(slug);
  if (!resolved) return null;
  const range = cityPageRange();
  const result = await seoEvents({ ...resolved.city, ...range, limit: 80 });
  return { ...resolved, range, ...result };
});

export async function generateMetadata({ params }) {
  const { city: slug } = await params;
  const data = await load(slug);
  if (!data) return {};
  const { city } = data;
  const title = `Events in ${city.label} – Veranstaltungen & Eventkalender`;
  const description = `Aktuelle Events, Familienprogramm und Ausflugsideen in und rund um ${city.label}. Laufend aktualisiert aus offiziellen und lokalen Quellen.`;
  const canonical = cityPath(city);
  return {
    title,
    description,
    alternates: { canonical },
    robots: isIndexableEventCount(data.total) ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: 'website', url: publicUrl(canonical) },
  };
}

export default async function CityEventsPage({ params }) {
  const { city: slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  if (!data.canonical) permanentRedirect(cityPath(data.city));
  const title = `Events in ${data.city.label}: Was ist los?`;
  const description = `Aktuelle Veranstaltungen und Ideen für Familien, Kultur, Musik, Märkte und mehr in und rund um ${data.city.label}.`;
  const path = cityPath(data.city);
  const ld = collectionJsonLd({ city: data.city, title, description, path, events: data.events, lastModified: data.lastModified });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <SeoEventPage city={data.city} title={title} intro={description} events={data.events} path={path} />
    </>
  );
}
