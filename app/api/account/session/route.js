import { NextResponse } from 'next/server';
import { currentAccount } from '../../../../lib/account-auth.js';
import { getSupabaseServerClient } from '../../../../lib/supabase-server.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { account: await currentAccount() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export async function DELETE() {
  const supabase = await getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.json({ account: null });
}
