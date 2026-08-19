// The root layout localizes the interactive app from request headers, which
// otherwise makes every descendant dynamic. SEO landing pages are deliberately
// German, mark their own content language, and must stay cacheable so traffic
// does not become one Vercel invocation plus one Supabase query per page view.
export const dynamic = 'force-static';

export default function EventsLayout({ children }) {
  return children;
}
