import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { issueIntakeProof, verifyIntakeProof } from '../lib/intake-proof.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('intake proofs are account, mode, reference and expiry bound', () => {
  const proof = issueIntakeProof('user-a', 'photo', 'scan-123.jpg', 1_000);
  assert.ok(proof);
  assert.equal(verifyIntakeProof(proof, 'user-a', 'photo', 'scan-123.jpg', 1_100), true);
  assert.equal(verifyIntakeProof(proof, 'user-b', 'photo', 'scan-123.jpg', 1_100), false);
  assert.equal(verifyIntakeProof(proof, 'user-a', 'link', 'scan-123.jpg', 1_100), false);
  assert.equal(verifyIntakeProof(proof, 'user-a', 'photo', 'scan-999.jpg', 1_100), false);
  assert.equal(verifyIntakeProof(proof, 'user-a', 'photo', 'scan-123.jpg', 1_901), false);
  assert.equal(verifyIntakeProof(`${proof.slice(0, -1)}x`, 'user-a', 'photo', 'scan-123.jpg', 1_100), false);
});

test('untrusted callers cannot claim scan/link provenance or mutate canonical rows', () => {
  const route = read('app/api/events/route.js');
  const db = read('lib/db.js');
  assert.match(route, /verifyIntakeProof\(raw\.intake_proof, account\.id, 'photo', rawPhotoPath\)/);
  assert.match(route, /verifyIntakeProof\(raw\.intake_proof, account\.id, 'link', sourceUrl\)/);
  assert.match(route, /const strict = !trustedPhoto && !trustedSourceUrl/);
  assert.match(route, /photo_path: trustedPhoto/);
  assert.match(route, /source_url: trustedSourceUrl/);
  assert.match(route, /updateOwnedEventFields\(account\.id, match\.id, patch\)/);
  assert.match(route, /upsertEvent\([\s\S]*actorUserId: account\.id/);
  assert.match(db, /actorUserId && !\(await userCanEditContribution\(actorUserId, id\)\)/);
  assert.match(db, /return \{ id, updated: false, protected: true/);
});

test('auth cookies are inaccessible to browser scripts', () => {
  for (const path of ['lib/supabase-server.js', 'lib/supabase-middleware.js']) {
    const source = read(path);
    assert.match(source, /cookieOptions:\s*\{[\s\S]*httpOnly:\s*true/);
    assert.match(source, /sameSite:\s*'lax'/);
    assert.match(source, /secure:\s*process\.env\.NODE_ENV === 'production'/);
  }
});

test('costly and writable account paths have account-principal limits', () => {
  const scan = read('app/api/scan/route.js');
  const link = read('app/api/extract-url/route.js');
  const publish = read('app/api/events/route.js');
  const login = read('app/api/account/login/route.js');
  const favorites = read('app/api/account/favorites/route.js');
  const db = read('lib/db.js');
  assert.match(scan, /limitSubject\('account', account\.id, 'scan_account'/);
  assert.match(link, /limitSubject\('account', account\.id, 'scan_account'/);
  assert.match(publish, /limitSubject\('account', account\.id, 'submit_account'/);
  assert.match(login, /limitSubject\('login-email', email, 'account_login_email'/);
  assert.match(favorites, /limitSubject\('account', account\.id, 'account_favorite_user'/);
  assert.match(db, /pg_advisory_xact_lock/);
  assert.match(db, /export async function takeRateSlot/);
});

test('account authorization rejects revoked sessions, not just valid JWTs', () => {
  const auth = read('lib/account-auth.js');
  const db = read('lib/db.js');
  assert.match(auth, /claims\.session_id/);
  assert.match(auth, /isActiveAuthSession\(claims\.session_id, claims\.sub\)/);
  assert.match(db, /FROM auth\.sessions/);
  assert.match(db, /id=\$\{sessionId\}::uuid AND user_id=\$\{userId\}::uuid/);
});

test('all account mutation surfaces reject cross-origin browser requests', () => {
  for (const path of [
    'app/api/account/login/route.js',
    'app/api/account/favorites/route.js',
    'app/api/account/session/route.js',
    'app/api/events/route.js',
    'app/api/scan/route.js',
    'app/api/extract-url/route.js',
  ]) assert.match(read(path), /isSameOriginMutation\(req\)/, `${path} needs the mutation guard`);
});
