import { NextResponse } from 'next/server';
import { LANGS, languageFromCountry } from './lib/i18n.js';
import { canonicalSeoPath } from './lib/seo-pages.js';
import { canonicalEventPath } from './lib/event-aliases.js';
import { refreshSupabaseSession } from './lib/supabase-middleware.js';

const LANG_COOKIE = 'okolo-lang';

export async function middleware(request) {
  const canonicalPath = canonicalSeoPath(request.nextUrl.pathname)
    || canonicalEventPath(request.nextUrl.pathname);
  if (canonicalPath) {
    const canonical = request.nextUrl.clone();
    canonical.pathname = canonicalPath;
    return NextResponse.redirect(canonical, 308);
  }

  const manualLang = request.cookies.get(LANG_COOKIE)?.value;
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country');
  const lang = LANGS.includes(manualLang) ? manualLang : languageFromCountry(country);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-okolo-lang', lang);
  return refreshSupabaseSession(request, requestHeaders);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|sw.js).*)'],
};
