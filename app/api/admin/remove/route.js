import { NextResponse } from 'next/server';
import { setEventStatus } from '../../../../lib/db.js';
import { isAdmin } from '../../../../lib/admin-auth.js';

export const dynamic = 'force-dynamic';

// One-click moderation from the notification email: sets status='removed'
// (reversible in the DB, row is kept). GET so it works as a mail link.
//
// This is the ONE place a URL token is still accepted (`allowToken`): a link in
// an email cannot present a login form, and the whole point is that you can kill
// a bad event from your phone in one tap. A logged-in admin session works too.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get('id') || '';
  // Token-only: never accept the session cookie on this state-mutating GET
  // (SameSite=Lax sends it on a crafted cross-site link → CSRF).
  if (!isAdmin(req, { allowToken: true, tokenOnly: true })) return new NextResponse('Nicht erlaubt.', { status: 403 });
  // ids are bigint (string in JS); validate the raw digits, don't Number()-coerce.
  if (!/^\d+$/.test(idRaw) || idRaw === '0') return new NextResponse('Ungültige ID.', { status: 400 });

  const row = await setEventStatus(idRaw, 'removed');
  if (!row) return new NextResponse(`Eintrag ${idRaw} nicht gefunden.`, { status: 404 });
  return new NextResponse(`Entfernt: „${row.title}" (ID ${row.id}). Der Eintrag ist nicht mehr auf der Karte.`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
