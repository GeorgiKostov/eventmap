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
  const id = Number(searchParams.get('id'));
  if (!isAdmin(req, { allowToken: true })) return new NextResponse('Nicht erlaubt.', { status: 403 });
  if (!Number.isInteger(id) || id <= 0) return new NextResponse('Ungültige ID.', { status: 400 });

  const row = await setEventStatus(id, 'removed');
  if (!row) return new NextResponse(`Eintrag ${id} nicht gefunden.`, { status: 404 });
  return new NextResponse(`Entfernt: „${row.title}" (ID ${row.id}). Der Eintrag ist nicht mehr auf der Karte.`, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
