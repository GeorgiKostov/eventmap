import { NextResponse } from 'next/server';
import { currentAccount, authRequiredMessage } from '../../../../lib/account-auth.js';
import { userContributions } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const account = await currentAccount();
  if (!account) {
    return NextResponse.json({ error: authRequiredMessage(req), code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  return NextResponse.json(
    { submissions: await userContributions(account.id) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
