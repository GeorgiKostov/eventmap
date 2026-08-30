const SESSION_FREE_GETS = new Set([
  '/api/events',
  '/api/geocode',
  '/partners',
  '/partners/demo',
]);

// Public read APIs and the static sales showcase never inspect account state.
// Protected mutations and account routes must continue through Supabase's
// refresh/validation path.
export function shouldRefreshSession(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return true;
  return !SESSION_FREE_GETS.has(request.nextUrl.pathname);
}
