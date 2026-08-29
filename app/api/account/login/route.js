import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../../lib/supabase-server.js';
import { safeAuthNext } from '../../../../lib/auth-redirect.js';
import { limit, limitSubject } from '../../../../lib/ratelimit.js';

export const dynamic = 'force-dynamic';
const AUTH_NEXT_COOKIE = 'okolo-auth-next';

function withAuthNext(response, next, req) {
  response.cookies.set(AUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(req.url).protocol === 'https:',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}

export async function POST(req) {
  const rl = await limit(req, 'account_login', { perHour: 10, perDay: 30, globalPerDay: 500 });
  if (rl) return NextResponse.json({ error: 'Too many sign-in attempts — try again later.' }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const next = safeAuthNext(body.next);
  const callback = new URL('/auth/callback', req.url);
  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Sign-in is not configured.' }, { status: 503 });

  if (body.provider === 'google') {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      console.error(`[auth] Google OAuth start failed (${error?.code || 'provider_error'})`);
      return NextResponse.json({ error: 'Could not start Google sign-in.' }, { status: 502 });
    }
    return withAuthNext(NextResponse.json({ url: data.url }), next, req);
  }

  if (body.provider !== 'email') {
    return NextResponse.json({ error: 'Unsupported sign-in method.' }, { status: 400 });
  }
  // Simple form-filling bots get a plausible success without sending mail.
  if (body.website) return withAuthNext(NextResponse.json({ sent: true }), next, req);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  // Stop a bot rotating networks to repeatedly send mail to one victim. The
  // target is stored only as a salted opaque hash, never as an email address.
  const targetLimit = await limitSubject('login-email', email, 'account_login_email', {
    perHour: 3,
    perDay: 8,
    globalPerDay: 200,
  });
  if (targetLimit) {
    return NextResponse.json({ error: 'Too many sign-in attempts — try again later.' }, { status: 429 });
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  });
  if (error) {
    console.error(`[auth] magic-link start failed (${error.code || 'provider_error'})`);
    return NextResponse.json({ error: 'Could not send the sign-in link.' }, { status: 502 });
  }
  return withAuthNext(NextResponse.json({ sent: true }), next, req);
}
