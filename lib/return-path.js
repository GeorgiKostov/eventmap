// Preserve context across a leaf-page visit without creating an open redirect.
// Only permanent, dated weekend pages are valid return destinations.
export function safeWeekendReturn(value) {
  if (typeof value !== 'string') return null;
  return /^\/weekend\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
