import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { supabasePublicEnv } from './supabase-env.js';

export async function refreshSupabaseSession(request, requestHeaders) {
  const env = supabasePublicEnv();
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!env) return response;

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Do not trust getSession() for authorization. This validates/refreshes the
  // token and makes the fresh cookies available to route handlers.
  await supabase.auth.getClaims();
  return response;
}
