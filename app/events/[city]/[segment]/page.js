import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { getChannel, weekendWindow } from '../../../../lib/city-channels.js';
import { seoEvents } from '../../../../lib/db.js';
import { loadDigestFor } from '../../../../lib/digest.js';
import { publicUrl } from '../../../../lib/public-url.js';
import {
  SEO_CITIES,
  availableDigestItems,
  cityIntentPath,
  cityPageRange,
  isIndexableEventCount,
  resolveSeoCity,
  seoDateRangeLabel,
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
    title: (city, dates) => `Events dieses Wochenende in ${city}${dates ? ` (${dates})` : ''}`,
    heading: (city, dates) => `Events dieses Wochenende in ${city}${dates ? `: ${dates}` : ''}`,
    description: (city, dates, hasHighlights) => `${hasHighlights ? 'Ausgewählte Tipps und alle' : 'Alle'} aktuellen Veranstaltungen${dates ? ` vom ${dates}` : ''} in ${city} und Umgebung — Familienprogramm, kostenlose Events, Kultur, Musik und Märkte aus lokalen Quellen.`,
  },
};

export function generateStaticParams() {
  return SEO_CITIES.flatMap((city) => Object.keys(INTENTS).map((segment) => ({ city: city.slug, segment })));
}

function rangeForIntent(intent) {
  if (intent === 'heute') return todayRange();
  if (intent === 'wochenende') {
    return weekendWindow('Europe/Vienna');
  }
  return cityPageRange();
}

const load = cache(async (slug, intent) => {
  const resolved = resolveSeoCity(slug);
  if (!resolved || !INTENTS[intent]) return null;
  const range = rangeForIntent(intent);
  const result = await seoEvents({ ...resolved.city, ...range, kids: intent === 'kinder', limit: 80 });
  const channel = intent === 'wochenende' ? getChannel(resolved.city.slug) : null;
  const digest = channel ? await loadDigestFor(channel, range.friday) : null;
  return { ...resolved, range, digest, ...result };
});

function datesFor(data, segment) {
  return segment === 'wochenende'
    ? seoDateRangeLabel(data.range.friday, data.range.sunday)
    : null;
}

function hasHighlights(data, segment) {
  return segment === 'wochenende' && availableDigestItems(data.digest, data.events).length > 0;
}

export async function generateMetadata({ params }) {
  const { city: slug, segment } = await params;
  const data = await load(slug, segment);
  if (!data) return {};
  const copy = INTENTS[segment];
  const dates = datesFor(data, segment);
  const title = copy.title(data.city.label, dates);
  const description = copy.description(data.city.label, dates, hasHighlights(data, segment));
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
  const dates = datesFor(data, segment);
  const title = copy.heading(data.city.label, dates);
  const description = copy.description(data.city.label, dates, hasHighlights(data, segment));
  const path = cityIntentPath(data.city, segment);
  const ld = collectionJsonLd({ city: data.city, title, description, path, events: data.events, lastModified: data.lastModified });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <SeoEventPage
        city={data.city}
        title={title}
        intro={description}
        events={data.events}
        path={path}
        intent={segment}
        digest={data.digest}
        range={data.range}
        total={data.total}
        facets={data.facets}
        lastModified={data.lastModified}
      />
    </>
  );
}
