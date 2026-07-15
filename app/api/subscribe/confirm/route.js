import { confirmSubscriber } from '../../../../lib/db.js';

export const dynamic = 'force-dynamic';

const COPY = {
  de: {
    ok: 'Anmeldung bestätigt', okBody: 'Danke! Du bekommst ab jetzt den Okolo-Newsletter für deine Region.',
    manage: 'Ort oder Interessen ändern? Melde dich einfach erneut mit derselben E-Mail-Adresse an — wir aktualisieren deine Angaben.',
    unsub: 'Newsletter abbestellen',
    bad: 'Link ungültig', badBody: 'Dieser Bestätigungslink ist ungültig oder abgelaufen. Melde dich einfach erneut an — du bekommst dann einen neuen Link.',
  },
  en: {
    ok: 'Subscription confirmed', okBody: 'Thanks! You’ll now receive the Okolo newsletter for your area.',
    manage: 'Want to change your area or interests? Just sign up again with the same email address — we’ll update your preferences.',
    unsub: 'Unsubscribe from the newsletter',
    bad: 'Invalid link', badBody: 'This confirmation link is invalid or has expired. Just sign up again to get a fresh link.',
  },
  bg: {
    ok: 'Абонаментът е потвърден', okBody: 'Благодарим! Вече ще получаваш бюлетина на Okolo за твоя район.',
    manage: 'Искаш да промениш района или интересите си? Просто се абонирай отново със същия имейл — ще обновим настройките ти.',
    unsub: 'Отписване от бюлетина',
    bad: 'Невалиден линк', badBody: 'Този линк за потвърждение е невалиден или изтекъл. Просто се абонирай отново, за да получиш нов линк.',
  },
};

function page(title, body, footer = '') {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Okolo</title></head><body style="font-family:system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#212b28;text-align:center"><h1 style="font-size:1.4rem">${title}</h1><p style="color:#4a5652;line-height:1.5">${body}</p>${footer}<p style="margin-top:2rem"><a href="/" style="color:#C93A5B;text-decoration:none;font-weight:600">→ okolo.events</a></p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const lang = searchParams.get('lang');
  const c = COPY[lang] || COPY.en;
  const email = token ? await confirmSubscriber(token) : null;
  if (!email) return page(c.bad, c.badBody);
  // The confirmed subscriber gets their exit and their settings in the same
  // breath as the welcome: the unsubscribe link reuses the token they just
  // proved control of, and preferences are managed by simply re-signing up
  // (addSubscriber updates a confirmed row in place, no re-confirm mail).
  const unsubUrl = `/api/subscribe/unsubscribe?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang || 'en')}`;
  const footer =
    `<p style="color:#8a938f;font-size:.85rem;line-height:1.5;margin-top:1.5rem">${c.manage}</p>` +
    `<p style="margin-top:.75rem"><a href="${unsubUrl}" style="color:#8a938f;font-size:.85rem;text-decoration:underline">${c.unsub}</a></p>`;
  return page(c.ok, c.okBody, footer);
}
