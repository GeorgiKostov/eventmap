// Auth uses Supabase's publishable browser key. Keep this separate from
// DATABASE_URL: the latter is server-only and must never reach client code.
export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || '';
  return url && key ? { url, key } : null;
}
