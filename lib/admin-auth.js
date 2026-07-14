import crypto from 'crypto';

// Shared ADMIN_TOKEN gate for the operator surfaces (one-click removal from the
// notification mail, the Thursday digest dashboard). Prototype-grade on purpose:
// a single shared secret, constant-time compared, no accounts. Replace with real
// auth if the admin surface ever grows past George.
export function adminOk(token) {
  const expected = process.env.ADMIN_TOKEN || '';
  const given = String(token || '');
  if (expected.length < 16 || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
