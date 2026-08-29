// OAuth/magic-link callbacks only need these two destinations today. A closed
// list also rejects backslash variants such as `/\\evil.example`, which URL
// parsers may normalize into a cross-origin redirect even though they begin `/`.
const AUTH_DESTINATIONS = new Set(['/', '/?add=1']);

export function safeAuthNext(value, fallback = '/') {
  return typeof value === 'string' && AUTH_DESTINATIONS.has(value) ? value : fallback;
}
