import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { seoEvents } from '../../../../../lib/db.js';
import { publicUrl } from '../../../../../lib/public-url.js';
import {
  SEO_CITIES,
  SEO_MONTHS_TO_PREGENERATE,
  cityMonthPath,
  isIndexableEventCount,
  isSupportedMonth,
  monthLabel,
  monthRange,
  resolveSeoCity,
  upcomingMonthSlugs,
} from '../../../../../lib/seo-pages.js';
import SeoEventPage, { collectionJsonLd } from '../../../seo-page.js';

// Month inventory changes much more slowly than today/weekend pages. Six-hour
// ISR keeps new imports timely while avoiding 54 hourly regenerations when
// crawlers eventually warm every city-month URL.
export const revalidate = 21600;

export function generateStaticParams() {
  const months = upcomingMonthSlugs(new Date(), SEO_MONTHS_TO_PREGENERATE);
  return SEO_CITIES.flatMap((city) => months.map((slug) => {
    const [segment, month] = slug.split('-');
    return { city: city.slug, segment, month };
  }));
}

const load = cache(async (slug, year, month) => {
  const resolved = resolveSeoCity(slug);
  const monthSlug = `${year}-${month}`;
  if (!resolved || !/^\d{4}$/.test(year) || !isSupportedMonth(monthSlug)) return null;
  const range = monthRange(monthSlug);
  const result = await seoEvents({ ...resolved.city, ...range, limit: 100 });
  return { ...resolved, monthSlug, range, ...result };
});

export async function generateMetadata({ params }) {
  const { city: slug, segment, month } = await params;
  const data = await load(slug, segment, month);
  if (!data) return {};
  const label = monthLabel(data.monthSlug);
  const title = `Events in ${data.city.label} im ${label}`;
  const description = `Veranstaltungen, Familienprogramm und Ausflugsideen in und rund um ${data.city.label} im ${label}. Laufend aktualisiert von Okolo.`;
  const canonical = cityMonthPath(data.city, data.monthSlug);
  return {
    title,
    description,
    alternates: { canonical },
    robots: isIndexableEventCount(data.total) ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: 'website', url: publicUrl(canonical) },
  };
}

export default async function CityMonthPage({ params }) {
  const { city: slug, segment, month } = await params;
  const data = await load(slug, segment, month);
  if (!data) notFound();
  if (!data.canonical) permanentRedirect(cityMonthPath(data.city, data.monthSlug));
  const label = monthLabel(data.monthSlug);
  const title = `Events in ${data.city.label} im ${label}`;
  const description = `Entdecke aktuelle Events, Familienprogramm, Kultur, Musik und Märkte in und rund um ${data.city.label} im ${label}.`;
  const path = cityMonthPath(data.city, data.monthSlug);
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
        month={data.monthSlug}
        range={data.range}
        total={data.total}
        lastModified={data.lastModified}
      />
    </>
  );
}
