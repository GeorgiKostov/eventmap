import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { weekendWindow } from '../../../../lib/city-channels.js';
import { seoEvents } from '../../../../lib/db.js';
import { publicUrl } from '../../../../lib/public-url.js';
import {
  SEO_CITIES,
  cityIntentPath,
  cityPageRange,
  isIndexableEventCount,
  resolveSeoCity,
  todayRange,
} from '../../../../lib/seo-pages.js';
import SeoEventPage, { collectionJsonLd } from '../../seo-page.js';

export const revalidate = 3600;

const INTENTS = {
  heute: {
    title: (city) => `Events heute in ${city} – Was ist heute los?`,
    heading: (city) => `Events heute in ${city}`,
    description: (city) => `Veranstaltungen und Familienprogramm heute in und rund um ${city}. Laufend aktualisiert von Okolo.`,
  },
  kinder: {
    title: (city) => `Kinderveranstaltungen in ${city}`,
    heading: (city) => `Kinderveranstaltungen in ${city}`,
    description: (city) => `Aktuelle Events und Ausflugsideen für Kinder und Familien in und rund um ${city}.`,
  },
  wochenende: {
    title: (city) => `Was ist dieses Wochenende los in ${city}?`,
    heading: (city) => `Veranstaltungen dieses Wochenende in ${city}`,
    description: (city) => `Events, Familienprogramm, Kultur und Märkte dieses Wochenende in und rund um ${city}.`,
  },
};

export function generateStaticParams() {
  return SEO_CITIES.flatMap((city) => Object.keys(INTENTS).map((segment) => ({ city: city.slug, segment })));
}

function rangeForIntent(intent) {
  if (intent === 'heute') return todayRange();
  if (intent === 'wochenende') {
    const { from, to } = weekendWindow('Europe/Vienna');
    return { from, to };
  }
  return cityPageRange();
}

const load = cache(async (slug, intent) => {
  const resolved = resolveSeoCity(slug);
  if (!resolved || !INTENTS[intent]) return null;
  const range = rangeForIntent(intent);
  const result = await seoEvents({ ...resolved.city, ...range, kids: intent === 'kinder', limit: 80 });
  return { ...resolved, range, ...result };
});

export async function generateMetadata({ params }) {
  const { city: slug, segment } = await params;
  const data = await load(slug, segment);
  if (!data) return {};
  const copy = INTENTS[segment];
  const title = copy.title(data.city.label);
  const description = copy.description(data.city.label);
  const canonical = cityIntentPath(data.city, segment);
  return {
    title,
    description,
    alternates: { canonical },
    robots: isIndexableEventCount(data.total) ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: 'website', url: publicUrl(canonical) },
  };
}

export default async function CityIntentPage({ params }) {
  const { city: slug, segment } = await params;
  const data = await load(slug, segment);
  if (!data) notFound();
  if (!data.canonical) permanentRedirect(cityIntentPath(data.city, segment));
  const copy = INTENTS[segment];
  const title = copy.heading(data.city.label);
  const description = copy.description(data.city.label);
  const path = cityIntentPath(data.city, segment);
  const ld = collectionJsonLd({ city: data.city, title, description, path, events: data.events });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <SeoEventPage city={data.city} title={title} intro={description} total={data.total} events={data.events} intent={segment} />
    </>
  );
}
