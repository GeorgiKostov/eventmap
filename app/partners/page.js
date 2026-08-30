import PartnerShowcase from './partner-showcase.js';
import { publicBaseUrl } from '../../lib/public-url.js';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Hosted festival and partner maps',
  description: 'Okolo builds, hosts and distributes custom event maps for festivals and cultural programmes.',
  robots: { index: true, follow: true },
};

export default function PartnersPage() {
  const baseUrl = publicBaseUrl();
  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Okolo managed festival and partner maps',
    url: `${baseUrl}/partners`,
    provider: { '@type': 'Organization', name: 'Okolo', url: baseUrl },
    areaServed: { '@type': 'Country', name: 'Austria' },
    audience: { '@type': 'Audience', audienceType: 'Event organisers, festivals and cultural programmes' },
    serviceType: 'Managed event map, programme distribution and referral reporting',
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }} />
      <PartnerShowcase />
    </>
  );
}
