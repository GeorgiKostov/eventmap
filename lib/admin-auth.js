import crypto from 'crypto';

// Operator auth for the admin surfaces (the Thursday desk, one-click event
// removal). Still one operator, no accounts — but a PASSWORD you type once,
// not a secret you carry around in the URL bar.
//
// Why the URL-token approach was replaced: a `?token=` lands in browser history,
// in the Referer header of every outbound link, in screen-shares and in server
// logs. A cookie does not. So:
//
//   password (ADMIN_PASSWORD, never leaves the server)
//     → POST /api/admin/login, constant-time compared, rate-limited
//     → httpOnly + Secure + SameSite=Lax cookie holding a SIGNED session
//     → every admin route verifies the signature
//
// The session is stateless: `<expiry>.<HMAC(expiry)>`, keyed on the password
// itself. That means changing ADMIN_PASSWORD instantly invalidates every issued
// session — which is exactly what you want from a password change, and it costs
// us no session table.
//
// ADMIN_TOKEN is KEPT, but only for the one-click links in notification emails
// (/api/admin/remove): a mail client following a link cannot carry a login form.

export const ADMIN_COOKIE = 'okolo_admin';
const MAX_AGE_S = 30 * 24 * 3600; // 30 days — long enough to not re-login weekly

function key() {
  const pw = process.env.ADMIN_PASSWORD || '';
  // No password configured = admin is closed, not open. Never fall back to a
  // default: an empty key would make every signature verify.
  return pw.length >= 8 ? pw : null;
}

function sign(value) {
  const k = key();
  if (!k) return null;
  return crypto.createHmac('sha256', k).update(value).digest('hex');
}

// Constant-time compare that also tolerates length differences (timingSafeEqual
// throws when the buffers differ in size, which itself leaks length).
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba); // keep the work constant-ish
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function passwordOk(candidate) {
  const k = key();
  if (!k) return false;
  return safeEqual(candidate ?? '', k);
}

export function makeSession() {
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  const sig = sign(exp);
  return sig ? `${exp}.${sig}` : null;
}

export function sessionValid(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return false;
  const [exp, sig] = cookieValue.split('.');
  if (!exp || !sig) return false;
  const expected = sign(exp);
  if (!expected || !safeEqual(sig, expected)) return false;
  return Number(exp) > Date.now();
}

// The single gate every admin route calls. A valid session cookie, or — for the
// email one-click links only — a correct ADMIN_TOKEN in the query string.
export function isAdmin(req, { allowToken = false } = {}) {
  const cookie = req.cookies?.get?.(ADMIN_COOKIE)?.value;
  if (sessionValid(cookie)) return true;
  if (allowToken) {
    const expected = process.env.ADMIN_TOKEN || '';
    const given = new URL(req.url).searchParams.get('token') || '';
    if (expected.length >= 16 && safeEqual(given, expected)) return true;
  }
  return false;
}

export const cookieOptions = {
  httpOnly: true, // JS can't read it → an XSS can't steal the session
  secure: process.env.NODE_ENV === 'production', // https-only in prod, still works on localhost
  sameSite: 'lax',
  path: '/',
  maxAge: MAX_AGE_S,
};
