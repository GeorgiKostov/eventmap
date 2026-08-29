import { NextResponse } from 'next/server';
import { currentAccount, authRequiredMessage } from '../../../../lib/account-auth.js';
import { mergeUserFavorites, setUserFavorite, userFavoriteIds } from '../../../../lib/db.js';
import { limit, limitSubject } from '../../../../lib/ratelimit.js';
import { isSameOriginMutation } from '../../../../lib/request-security.js';

export const dynamic = 'force-dynamic';

async function accountOr401(req) {
  const account = await currentAccount();
  if (account) return { account, response: null };
  return {
    account: null,
    response: NextResponse.json({ error: authRequiredMessage(req), code: 'AUTH_REQUIRED' }, { status: 401 }),
  };
}
export async function GET(req) {
  const { account, response } = await accountOr401(req);
  if (response) return response;
  return NextResponse.json(
    { ids: await userFavoriteIds(account.id) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(req) {
  if (!isSameOriginMutation(req)) {
    return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  }
  const { account, response } = await accountOr401(req);
  if (response) return response;
  const rl = await limit(req, 'account_favorite', { perHour: 180, perDay: 1000 })
    || await limitSubject('account', account.id, 'account_favorite_user', { perHour: 180, perDay: 300 });
  if (rl) return NextResponse.json({ error: 'Too many actions — try again later.' }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  if (body.action === 'merge') {
    if (!Array.isArray(body.ids) || body.ids.length > 100) {
      return NextResponse.json({ error: 'Invalid favourites list.' }, { status: 400 });
    }
    const ids = await mergeUserFavorites(account.id, body.ids);
    return NextResponse.json({ ok: true, ids });
  }

  const id = String(body.id || '');
  if (!/^\d+$/.test(id) || typeof body.on !== 'boolean') {
    return NextResponse.json({ error: 'Invalid favourite.' }, { status: 400 });
  }
  const ids = await setUserFavorite(account.id, id, body.on);
  return NextResponse.json({ ok: true, ids });
}
