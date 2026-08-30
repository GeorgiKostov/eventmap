import { NextResponse } from 'next/server';
import { LANGS, languageFromCountry } from './lib/i18n.js';
import { canonicalSeoPath } from './lib/seo-pages.js';
import { canonicalEventPath } from './lib/event-aliases.js';
import { refreshSupabaseSession } from './lib/supabase-middleware.js';
import { shouldRefreshSession } from './lib/session-refresh.js';

const LANG_COOKIE = 'okolo-lang';

// Public read APIs and the static sales showcase never inspect account state.
// Refreshing Supabase Auth on those paths adds a remote request to every map
// movement and can attach Set-Cookie, which prevents otherwise-public CDN
// responses from being cached. Protected mutations and account routes continue
// through the normal refresh/validation path.
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
  if (!shouldRefreshSession(request)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  return refreshSupabaseSession(request, requestHeaders);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|sitemap.xml|sw.js).*)'],
};
