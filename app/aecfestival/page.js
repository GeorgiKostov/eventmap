import Home from '../page.js';
import { notFound } from 'next/navigation';

export const metadata = {
  title: 'Partner preview — Okolo',
  description: 'A private concept preview of a dedicated festival map on Okolo.',
  robots: { index: false, follow: true },
};

export default function ArsElectronicaPartnerPreview() {
  // This is uncommissioned sales material. Keep it available for local
  // screenshots, but fail closed if the shared worktree is ever deployed.
  if (process.env.NODE_ENV === 'production') notFound();
  return <Home partnerSlug="aecfestival" />;
}
