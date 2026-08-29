import crypto from 'crypto';
import { takeRateSlot } from './db.js';

// IP is only ever stored hashed. Set RATELIMIT_SALT in prod so hashes aren't
// guessable across deploys.
const SALT = process.env.RATELIMIT_SALT || 'okolo-dev-salt';

function clientIp(req) {
  // Trust ONLY platform-set headers. `x-forwarded-for` is client-supplied and
  // its LEFTMOST entry is fully attacker-controlled — rotating it would hand a
  // brute-forcer a fresh rate-limit budget on every request. On Vercel,
  // `x-vercel-forwarded-for` / `x-real-ip` are set by the edge and cannot be
  // spoofed; the RIGHTMOST xff hop (appended by the edge) is the last-resort
  // fallback for other hosts. Never the leftmost.
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',');
    return hops[hops.length - 1].trim();
  }
  return 'local';
}

export function hashIp(req) {
  return hashRateKey('ip', clientIp(req));
}

// The existing DB column is named ip_hash for historical reasons, but it can
// safely hold any opaque, salted principal. Namespacing prevents the same raw
// value from correlating an account, email target and network address.
export function hashRateKey(namespace, value) {
  return crypto.createHmac('sha256', SALT)
    .update(`${namespace}|${String(value)}`)
    .digest('hex')
    .slice(0, 32);
}

export async function limitKey(key, action, { perHour, perDay, globalPerDay } = {}) {
  return takeRateSlot(key, action, { perHour, perDay, globalPerDay });
}

export function limitSubject(namespace, value, action, options) {
  return limitKey(hashRateKey(namespace, value), action, options);
}

// Returns null when the request is allowed (and records the hit), or
// { retryAfter, scope } when a limit is exceeded. globalPerDay is a cost
// circuit-breaker across all users (mainly for the LLM-backed scan route).
export async function limit(req, action, { perHour, perDay, globalPerDay } = {}) {
  const result = await limitKey(hashIp(req), action, { perHour, perDay, globalPerDay });
  return result?.scope === 'principal' ? { ...result, scope: 'ip' } : result;
}
