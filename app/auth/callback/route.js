import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase-server.js';
import { safeAuthNext } from '../../../lib/auth-redirect.js';

const AUTH_NEXT_COOKIE = 'okolo-auth-next';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeAuthNext(
    request.cookies.get(AUTH_NEXT_COOKIE)?.value || url.searchParams.get('next'),
  );
  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = supabase
      ? await supabase.auth.exchangeCodeForSession(code)
      : { error: new Error('Auth is not configured') };
    if (!error) {
      const response = NextResponse.redirect(new URL(next, url.origin));
      response.cookies.set(AUTH_NEXT_COOKIE, '', { path: '/', maxAge: 0 });
      return response;
    }
  }
  const response = NextResponse.redirect(new URL('/?auth_error=1', url.origin));
  response.cookies.set(AUTH_NEXT_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
