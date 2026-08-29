// Browsers attach Origin to cross-origin mutations and Sec-Fetch-Site cannot be
// forged by page JavaScript. Cookies are SameSite=Lax already; this is a second
// boundary for login-email abuse and for the multipart scan route in case an
// Okolo sibling origin is ever compromised. Non-browser clients may omit both
// headers, but still need a valid account cookie for protected routes.
export function isSameOriginMutation(req) {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}
