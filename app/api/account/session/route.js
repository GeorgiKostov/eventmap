import { NextResponse } from 'next/server';
import { currentAccount } from '../../../../lib/account-auth.js';
import { getSupabaseServerClient } from '../../../../lib/supabase-server.js';
import { isSameOriginMutation } from '../../../../lib/request-security.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { account: await currentAccount() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
export async function DELETE(req) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  }
  const supabase = await getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.json({ account: null });
}
