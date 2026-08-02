const DEFAULT_BASE_URL = 'https://www.okolo.events';

// One canonical public origin for metadata, sitemaps, JSON-LD, and links sent
// outside the app. Production historically supplied `https://okolo.events/`:
// the trailing slash produced `//event/...` URLs, while the bare host itself
// redirects to www. Normalize both so crawlers see the URL users actually land
// on. Local and preview origins keep their configured hostname.
export function publicBaseUrl(raw = process.env.NEXT_PUBLIC_BASE_URL) {
  const url = new URL(raw || DEFAULT_BASE_URL);
  if (url.hostname === 'okolo.events') url.hostname = 'www.okolo.events';
  return url.origin;
}

export function publicUrl(path = '', raw) {
  const suffix = path ? `/${String(path).replace(/^\/+/, '')}` : '';
  return `${publicBaseUrl(raw)}${suffix}`;
}
