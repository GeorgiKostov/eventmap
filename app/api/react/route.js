import { NextResponse } from 'next/server';
import { react, getEvent, REACTION_KINDS } from '../../../lib/db.js';
import { limit, hashIp } from '../../../lib/ratelimit.js';

export const dynamic = 'force-dynamic';

const MESSAGES = {
  de: { limited: 'Zu viele Aktionen — bitte später wieder.', bad: 'Ungültige Anfrage.' },
  en: { limited: 'Too many actions — please try again later.', bad: 'Invalid request.' },
  bg: { limited: 'Твърде много действия — опитай отново по-късно.', bad: 'Невалидна заявка.' },
};

// One-tap anonymous signals: 'interest' (toggle) and the data-quality reports.
// There is no free-text field here on purpose — the payload is a closed enum, so
// this endpoint cannot be used to publish anything. The only abuse available is
// counter-skew, which the per-(event,kind,ip_hash) unique index and the display
// thresholds already absorb; that is why it needs no captcha.
export async function POST(req) {
  const messages = MESSAGES[req.headers.get('x-okolo-lang')] || MESSAGES.en;

  // Generous vs the submit limits — tapping "interested" on a dozen events while
  // planning a weekend is normal use, not abuse.
  const rl = await limit(req, 'react', { perHour: 60, perDay: 200, globalPerDay: 5000 });
  if (rl) return NextResponse.json({ error: messages.limited }, { status: 429 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: messages.bad }, { status: 400 }); }

  const id = Number(body?.id);
  const kind = String(body?.kind || '');
  if (!Number.isInteger(id) || id <= 0 || !REACTION_KINDS.includes(kind)) {
    return NextResponse.json({ error: messages.bad }, { status: 400 });
  }
  // Don't let the table accumulate rows for events that don't exist (or aren't
  // published) — the FK would allow it, but there'd be nothing to show them on.
  if (!(await getEvent(id))) return NextResponse.json({ error: messages.bad }, { status: 404 });

  const count = await react(id, kind, hashIp(req), { on: body?.on !== false });
  return NextResponse.json({ ok: true, count });
}
