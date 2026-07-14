import crypto from 'crypto';
import { recordRateHit, countRateHits, countActionAll } from './db.js';

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
  return crypto.createHash('sha256').update(`${SALT}|${clientIp(req)}`).digest('hex').slice(0, 32);
}

// Returns null when the request is allowed (and records the hit), or
// { retryAfter, scope } when a limit is exceeded. globalPerDay is a cost
// circuit-breaker across all users (mainly for the LLM-backed scan route).
export async function limit(req, action, { perHour, perDay, globalPerDay } = {}) {
  const ip = hashIp(req);
  if (perHour != null && (await countRateHits(ip, action, 60)) >= perHour) {
    return { retryAfter: 3600, scope: 'ip', window: 'hour', max: perHour };
  }
  if (perDay != null && (await countRateHits(ip, action, 1440)) >= perDay) {
    return { retryAfter: 86400, scope: 'ip', window: 'day', max: perDay };
  }
  if (globalPerDay != null && (await countActionAll(action, 1440)) >= globalPerDay) {
    return { retryAfter: 86400, scope: 'global', window: 'day', max: globalPerDay };
  }
  await recordRateHit(ip, action);
  return null;
}
