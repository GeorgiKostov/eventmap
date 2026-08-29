import crypto from 'crypto';

const DEV_SECRET = 'okolo-dev-intake-proof';
const MAX_AGE_SECONDS = 15 * 60;
const MODES = new Set(['photo', 'link']);

function secret() {
  const value = process.env.RATELIMIT_SALT;
  if (value) return value;
  if (process.env.NODE_ENV === 'production') return null;
  return DEV_SECRET;
}

function sign(encoded, key) {
  return crypto.createHmac('sha256', key).update(encoded).digest('base64url');
}

function validInput(accountId, mode, reference) {
  return typeof accountId === 'string' && accountId.length <= 128
    && MODES.has(mode)
    && typeof reference === 'string' && reference.length > 0 && reference.length <= 500;
}

export function issueIntakeProof(accountId, mode, reference, nowSeconds = Math.floor(Date.now() / 1000)) {
  const key = secret();
  if (!key || !validInput(accountId, mode, reference)) return null;
  const encoded = Buffer.from(JSON.stringify({
    uid: accountId,
    mode,
    ref: reference,
    exp: nowSeconds + MAX_AGE_SECONDS,
  })).toString('base64url');
  return `${encoded}.${sign(encoded, key)}`;
}

export function verifyIntakeProof(token, accountId, mode, reference, nowSeconds = Math.floor(Date.now() / 1000)) {
  const key = secret();
  if (!key || typeof token !== 'string' || token.length > 1600 || !validInput(accountId, mode, reference)) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, signature] = parts;
  const expected = sign(encoded, key);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload.uid === accountId
      && payload.mode === mode
      && payload.ref === reference
      && Number.isInteger(payload.exp)
      && payload.exp >= nowSeconds
      && payload.exp <= nowSeconds + MAX_AGE_SECONDS;
  } catch {
    return false;
  }
}
