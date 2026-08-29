import PartnerShowcase from './partner-showcase.js';

export const metadata = {
  title: 'Festival partner maps',
  description: 'See how Okolo turns a city-wide festival programme into one branded, interactive map.',
  robots: { index: false, follow: false },
};

export default function PartnersPage() {
  return <PartnerShowcase />;
}

