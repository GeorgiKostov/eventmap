// OAuth/magic-link callbacks may only return to an on-site relative path.
// Reject scheme-relative URLs (`//evil.example`) as well as absolute URLs.
export function safeAuthNext(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
