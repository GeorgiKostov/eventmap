import PartnerDemo from './partner-demo.js';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Festival partner map demo',
  description: 'Explore a fictional, interactive example of a dedicated festival map powered by Okolo.',
  robots: { index: false, follow: false },
};

export default function PartnerDemoPage() {
  return <PartnerDemo />;
}
