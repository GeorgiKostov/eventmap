// Preserve context across a leaf-page visit without creating an open redirect.
// Only permanent, dated weekend pages are valid return destinations.
export function safeWeekendReturn(value) {
  if (typeof value !== 'string') return null;
  return /^\/weekend\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// SEO landing pages are also valid browsing context. Keep this closed to the
// finite route shapes we publish; accepting an arbitrary same-origin path here
// would turn a cosmetic Back link into an open redirect within the app.
export function safeDiscoveryReturn(value) {
  const weekend = safeWeekendReturn(value);
  if (weekend) return weekend;
  if (typeof value !== 'string') return null;
  return /^\/events\/[a-z0-9-]+(?:\/(?:heute|wochenende|kinder|\d{4}\/\d{2}))?$/.test(value)
    ? value
    : null;
}
