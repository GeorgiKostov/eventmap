import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeAuthNext } from '../lib/auth-redirect.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('auth callback only accepts same-site relative return paths', () => {
  assert.equal(safeAuthNext('/?add=1'), '/?add=1');
  assert.equal(safeAuthNext('/'), '/');
  assert.equal(safeAuthNext('/events/linz'), '/');
  assert.equal(safeAuthNext('https://evil.example'), '/');
  assert.equal(safeAuthNext('//evil.example'), '/');
  assert.equal(safeAuthNext('/\\evil.example'), '/');
  assert.equal(safeAuthNext(null), '/');
});

test('account sign-in is initiated server-side and sessions are verified from claims', () => {
  const login = read('app/api/account/login/route.js');
  const account = read('lib/account-auth.js');
  assert.match(login, /signInWithOAuth\(\{[\s\S]*provider: 'google'/);
  assert.match(login, /signInWithOtp\(\{/);
  assert.match(login, /safeAuthNext\(body\.next\)/);
  assert.match(account, /auth\.getClaims\(\)/);
  assert.doesNotMatch(account, /auth\.getSession\(\)/);
});

test('OAuth callback stays exact and return intent uses a short-lived cookie', () => {
  const login = read('app/api/account/login/route.js');
  const callback = read('app/auth/callback/route.js');
  assert.doesNotMatch(login, /callback\.searchParams\.set\(['"]next['"]/);
  assert.match(login, /httpOnly:\s*true/);
  assert.match(login, /sameSite:\s*'lax'/);
  assert.match(callback, /request\.cookies\.get\(AUTH_NEXT_COOKIE\)/);
  assert.match(callback, /maxAge:\s*0/);
});

test('every contribution endpoint validates an account before spending limits or doing work', () => {
  for (const path of ['app/api/events/route.js', 'app/api/scan/route.js', 'app/api/extract-url/route.js']) {
    const route = read(path);
    const post = route.slice(route.indexOf('export async function POST'));
    assert.match(post, /currentAccount\(\)/, `${path} must authenticate`);
    assert.match(post, /code: 'AUTH_REQUIRED'/, `${path} must return a typed auth error`);
    assert.ok(post.indexOf('currentAccount()') < post.indexOf('limit(req,'), `${path} must authenticate before rate-limit/cost work`);
  }
});

test('submissions are tracked separately on both merge and upsert paths', () => {
  const route = read('app/api/events/route.js');
  const calls = route.match(/recordEventContribution\(/g) || [];
  assert.equal(calls.length, 2);
  assert.match(route, /recordEventContribution\(account\.id, match\.id,[\s\S]*merged: update\.protected/);
  assert.match(route, /recordEventContribution\(account\.id, res\.id,[\s\S]*merged: !!res\.protected/);
});

test('account tables remain provider-neutral and private', () => {
  const schema = read('db/schema.sql');
  const accountSection = schema.slice(schema.indexOf('create table if not exists event_contributions'));
  assert.match(accountSection, /user_id\s+uuid not null/);
  assert.match(accountSection, /alter table event_contributions enable row level security/);
  assert.match(accountSection, /alter table user_favorites enable row level security/);
  assert.doesNotMatch(accountSection, /references auth\.users/);
});

test('the Add button is account-gated and favourites sync without numeric bigint coercion', () => {
  const page = read('app/page.js');
  const favorites = read('app/api/account/favorites/route.js');
  assert.match(page, /className="fab" onClick=\{requestOpenCapture\}/);
  assert.match(page, /openAccount\(false\)/);
  assert.match(page, /action: 'merge', ids: mergeIds/);
  assert.match(favorites, /const id = String\(body\.id \|\| ''\)/);
  assert.doesNotMatch(favorites, /Number\(body\.id/);
});

test('the actions menu leads with a visually isolated account action', () => {
  const page = read('app/page.js');
  const css = read('app/globals.css');
  const menu = page.slice(page.indexOf('<div className="menudrop">'), page.indexOf('<div className="language-picker">'));
  assert.ok(menu.indexOf('account-menuitem') < menu.indexOf('setSavedOpen(true)'), 'account must be the first menu action');
  assert.match(menu, /account \? 'signed-in' : 'signed-out'/);
  assert.match(menu, /<strong>\{account \? t\.account : t\.signIn\}<\/strong>/);
  assert.match(menu, /account\?\.email && <small>\{account\.email\}<\/small>/);
  assert.match(css, /\.account-menuitem\.signed-out[\s\S]*background:\s*var\(--accent\)/);
  assert.match(css, /\.menu-divider/);
});

test('a successful contribution refreshes the viewport and hydrates merged details', () => {
  const page = read('app/page.js');
  const finish = page.slice(page.indexOf('async function finishPublish'), page.indexOf('async function publish'));
  assert.match(finish, /await fetchViewport\(\)/);
  assert.doesNotMatch(finish, /loadEvents\(/);
  assert.match(page, /fetch\(`\/api\/events\?id=\$\{encodeURIComponent\(data\.id\)\}`\)/);
});
