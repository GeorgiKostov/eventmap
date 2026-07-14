import { NextResponse } from 'next/server';
import { passwordOk, makeSession, sessionValid, ADMIN_COOKIE, cookieOptions } from '../../../../lib/admin-auth.js';
import { limit } from '../../../../lib/ratelimit.js';

export const dynamic = 'force-dynamic';

// GET  → am I logged in? (the desk asks this on load)
// POST → { password } → set the signed session cookie
// DELETE → log out
//
// The password is the only thing that can mint a session, so this route is the
// one place worth brute-forcing. It is rate-limited per hashed IP (10/hour,
// 30/day) using the same durable limiter as the public write routes — an
// in-memory counter would reset on every serverless invocation and protect
// nothing.

export async function GET(req) {
  const authed = sessionValid(req.cookies.get(ADMIN_COOKIE)?.value);
  return NextResponse.json({ authed, configured: (process.env.ADMIN_PASSWORD || '').length >= 8 });
}

export async function POST(req) {
  if (!(process.env.ADMIN_PASSWORD || '').length) {
    return NextResponse.json({ error: 'No ADMIN_PASSWORD is set on this deployment.' }, { status: 503 });
  }
  // globalPerDay is the backstop if per-IP is ever defeated (spoofed/rotated
  // source): the password can be guessed at most 200×/day across ALL callers.
  const rl = await limit(req, 'admin_login', { perHour: 10, perDay: 30, globalPerDay: 200 });
  if (rl) return NextResponse.json({ error: 'Too many attempts — try again later.' }, { status: 429 });

  const { password } = await req.json().catch(() => ({}));
  if (!passwordOk(password)) {
    // Deliberately vague: never reveal whether the password was wrong or the
    // deployment is misconfigured.
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  const res = NextResponse.json({ authed: true });
  res.cookies.set(ADMIN_COOKIE, makeSession(), cookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ authed: false });
  res.cookies.set(ADMIN_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
