import PartnerShowcase from './partner-showcase.js';

export const metadata = {
  title: 'Hosted festival and partner maps',
  description: 'Okolo builds, hosts and distributes custom event maps for festivals and cultural programmes.',
  robots: { index: false, follow: false },
};

export default function PartnersPage() {
  return <PartnerShowcase />;
}
