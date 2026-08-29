import { getSupabaseServerClient } from './supabase-server.js';

// Authorization must use verified JWT claims, never the client session object
// or user_metadata. Supabase validates the token (locally through JWKS for new
// projects, against Auth for older symmetric signing keys).
export async function currentAccount() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
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
