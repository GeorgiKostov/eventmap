// Public, non-personalized route responses can be cached at three different
// layers. Browser caching prevents repeat work during one visit; CDN headers
// keep Vercel (and another standards-aware CDN) from invoking a function or
// touching Postgres for every identical request.
export function publicCacheHeaders({ browser = 15, edge = 60, stale = 300 } = {}) {
  const browserValue = `public, max-age=${browser}, stale-while-revalidate=${stale}`;
  const edgeValue = `public, s-maxage=${edge}, stale-while-revalidate=${stale}`;
  return {
    'Cache-Control': browserValue,
    'CDN-Cache-Control': edgeValue,
    'Vercel-CDN-Cache-Control': edgeValue,
  };
}
