import { unsubscribe } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

const COPY = {
  de: { ok: 'Abgemeldet', okBody: 'Du wurdest vom Okolo-Newsletter abgemeldet. Schade, dass du gehst!', bad: 'Link ungültig', badBody: 'Dieser Abmeldelink ist ungültig.' },
  en: { ok: 'Unsubscribed', okBody: 'You’ve been unsubscribed from the Okolo newsletter. Sorry to see you go!', bad: 'Invalid link', badBody: 'This unsubscribe link is invalid.' },
  bg: { ok: 'Отписан', okBody: 'Отписа се от бюлетина на Okolo. Жалко, че си отиваш!', bad: 'Невалиден линк', badBody: 'Този линк за отписване е невалиден.' },
};

function page(title, body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Okolo</title></head><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#212b28;text-align:center"><h1 style="font-size:1.4rem">${title}</h1><p style="color:#4a5652;line-height:1.5">${body}</p><p style="margin-top:2rem"><a href="/" style="color:#C93A5B;text-decoration:none;font-weight:600">→ okolo.events</a></p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

// GET so the one-click unsubscribe link in every newsletter works directly.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const c = COPY[searchParams.get('lang')] || COPY.en;
  const email = token ? await unsubscribe(token) : null;
  return page(email ? c.ok : c.bad, email ? c.okBody : c.badBody);
}
