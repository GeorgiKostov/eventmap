import { NextResponse } from 'next/server';
import { isAdmin } from '../../../../lib/admin-auth.js';
import { listHighlights, setHighlight, clearHighlight, getEvent } from '../../../../lib/db.js';

// Admin desk backend for paid/editorial event placement (app/admin/highlights/
// page.js, db/schema.sql `highlights`). One admin, one route:
//   GET  → every highlight period, newest first (listHighlights)
//   POST { eventId, tier, startsAt, endsAt, note? } → open a new period
//   POST { action:'clear', id }                     → delete a period
export const dynamic = 'force-dynamic';

const TIERS = ['gold', 'editorial'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ highlights: await listHighlights() });
}

export async function POST(req) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  if (body.action === 'clear') {
    if (body.id == null) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const ok = await clearHighlight(body.id);
    if (!ok) return NextResponse.json({ error: 'highlight not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const { eventId, tier, startsAt, endsAt, note } = body;
  if (eventId == null) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
  if (!TIERS.includes(tier)) {
    return NextResponse.json({ error: `tier must be one of: ${TIERS.join(', ')}` }, { status: 400 });
  }
  if (!DATE_RE.test(startsAt || '') || !DATE_RE.test(endsAt || '')) {
    return NextResponse.json({ error: 'startsAt/endsAt must be YYYY-MM-DD' }, { status: 400 });
  }
  if (startsAt > endsAt) {
    return NextResponse.json({ error: 'startsAt must not be after endsAt' }, { status: 422 });
  }

  // getEvent() only returns published rows — a removed/unknown id fails the
  // same "not found" check, which is exactly the helpful, honest answer here.
  const event = await getEvent(eventId);
  if (!event) return NextResponse.json({ error: 'event not found or not published' }, { status: 404 });

  const id = await setHighlight({ eventId, tier, startsAt, endsAt, note: note || null });
  return NextResponse.json({ ok: true, id });
}
