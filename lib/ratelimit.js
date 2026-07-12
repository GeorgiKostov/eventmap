import crypto from 'crypto';
import { recordRateHit, countRateHits, countActionAll } from './db.js';

// IP is only ever stored hashed. Set RATELIMIT_SALT in prod so hashes aren't
// guessable across deploys.
const SALT = process.env.RATELIMIT_SALT || 'okolo-dev-salt';

function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0].trim() : '') || req.headers.get('x-real-ip') || 'local';
}

export function hashIp(req) {
  return crypto.createHash('sha256').update(`${SALT}|${clientIp(req)}`).digest('hex').slice(0, 32);
}

// Returns null when the request is allowed (and records the hit), or
// { retryAfter, scope } when a limit is exceeded. globalPerDay is a cost
// circuit-breaker across all users (mainly for the LLM-backed scan route).
export async function limit(req, action, { perHour, perDay, globalPerDay } = {}) {
  const ip = hashIp(req);
  if (perHour != null && (await countRateHits(ip, action, 60)) >= perHour) return { retryAfter: 3600, scope: 'ip' };
  if (perDay != null && (await countRateHits(ip, action, 1440)) >= perDay) return { retryAfter: 3600, scope: 'ip' };
  if (globalPerDay != null && (await countActionAll(action, 1440)) >= globalPerDay) return { retryAfter: 3600, scope: 'global' };
  await recordRateHit(ip, action);
  return null;
}
