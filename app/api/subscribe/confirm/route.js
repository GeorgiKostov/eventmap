import { confirmSubscriber } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

const COPY = {
  de: { ok: 'Anmeldung bestätigt', okBody: 'Danke! Du bekommst ab jetzt den Okolo-Newsletter für deine Region.', bad: 'Link ungültig', badBody: 'Dieser Bestätigungslink ist ungültig oder abgelaufen.' },
  en: { ok: 'Subscription confirmed', okBody: 'Thanks! You’ll now receive the Okolo newsletter for your area.', bad: 'Invalid link', badBody: 'This confirmation link is invalid or has expired.' },
  bg: { ok: 'Абонаментът е потвърден', okBody: 'Благодарим! Вече ще получаваш бюлетина на Okolo за твоя район.', bad: 'Невалиден линк', badBody: 'Този линк за потвърждение е невалиден или изтекъл.' },
};

function page(title, body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Okolo</title></head><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#212b28;text-align:center"><h1 style="font-size:1.4rem">${title}</h1><p style="color:#4a5652;line-height:1.5">${body}</p><p style="margin-top:2rem"><a href="/" style="color:#C93A5B;text-decoration:none;font-weight:600">→ okolo.events</a></p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const c = COPY[searchParams.get('lang')] || COPY.en;
  const email = token ? await confirmSubscriber(token) : null;
  return page(email ? c.ok : c.bad, email ? c.okBody : c.badBody);
}
