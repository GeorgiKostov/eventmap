import { getSupabaseServerClient } from './supabase-server.js';
import { isActiveAuthSession } from './db.js';

// Authorization must use verified JWT claims, never the client session object
// or user_metadata. Supabase validates the token (locally through JWKS for new
// projects, against Auth for older symmetric signing keys).
export async function currentAccount() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub || !claims.session_id) return null;
  // getClaims verifies the JWT signature and expiry locally. Supabase access
  // tokens can otherwise remain valid until expiry after sign-out, so require
  // the token's session row too. This makes stolen/revoked sessions fail closed
  // immediately on every account route.
  try {
    if (!await isActiveAuthSession(claims.session_id, claims.sub)) return null;
  } catch (err) {
    console.error(`[auth] active-session check failed (${err?.code || 'database_error'})`);
    return null;
  }
  return {
    id: String(claims.sub),
    email: typeof claims.email === 'string' ? claims.email : null,
  };
}
export function authRequiredMessage(req) {
  const lang = req.headers.get('x-okolo-lang');
  if (lang === 'de') return 'Bitte melde dich an, um etwas hinzuzufügen.';
  if (lang === 'bg') return 'Влез в профила си, за да добавиш съдържание.';
  return 'Sign in to add something.';
}
