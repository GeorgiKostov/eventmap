import { confirmSubscriber } from '../../../../lib/db.js';
import { captureServer } from '../../../../lib/analytics-server.js';

export const dynamic = 'force-dynamic';

const COPY = {
  de: {
    ok: 'Anmeldung bestätigt', okBody: 'Danke! Du bekommst ab jetzt den Okolo-Newsletter für deine Region.',
    waitlistBody: 'Danke! Wir benachrichtigen dich einmalig, sobald eine Okolo-Ausgabe für deine Stadt startet.',
    manage: 'Ausgabe oder Stadt ändern',
    unsub: 'Newsletter abbestellen',
    bad: 'Link ungültig', badBody: 'Dieser Bestätigungslink ist ungültig oder abgelaufen. Melde dich einfach erneut an — du bekommst dann einen neuen Link.',
  },
  en: {
    ok: 'Subscription confirmed', okBody: 'Thanks! You’ll now receive the Okolo newsletter for your area.',
    waitlistBody: 'Thanks! We’ll notify you once when an Okolo edition launches for your city.',
    manage: 'Change edition or city',
    unsub: 'Unsubscribe from the newsletter',
    bad: 'Invalid link', badBody: 'This confirmation link is invalid or has expired. Just sign up again to get a fresh link.',
  },
  bg: {
    ok: 'Абонаментът е потвърден', okBody: 'Благодарим! Вече ще получаваш бюлетина на Okolo за твоя район.',
    waitlistBody: 'Благодарим! Ще те уведомим еднократно, когато стартира издание на Okolo за твоя град.',
    manage: 'Промени изданието или града',
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
  const subscriber = token ? await confirmSubscriber(token) : null;
  if (!subscriber) return page(c.bad, c.badBody);
  const edition = subscriber.subscriptionKind === 'edition';
  if (subscriber.newlyConfirmed) {
    await captureServer('newsletter_confirmed', {
      distinctId: `subscriber:${subscriber.id}`,
      properties: {
        source: subscriber.source || 'unknown',
        area: subscriber.areaLabel || null,
        lang: subscriber.lang || lang || 'en',
        signup_kind: subscriber.subscriptionKind,
      },
    });
  }
  // The confirmed subscriber gets both exits immediately: preferences and
  // unsubscribe reuse the token they just proved control of.
  const unsubUrl = `/api/subscribe/unsubscribe?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang || 'en')}`;
  const preferencesUrl = `/newsletter/preferences?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang || 'en')}`;
  const footer =
    `<p style="margin-top:1.5rem"><a href="${preferencesUrl}" style="color:#C93A5B;font-size:.9rem;font-weight:600;text-decoration:none">${c.manage}</a></p>` +
    `<p style="margin-top:.75rem"><a href="${unsubUrl}" style="color:#8a938f;font-size:.85rem;text-decoration:underline">${c.unsub}</a></p>`;
  return page(c.ok, edition ? c.okBody : c.waitlistBody, footer);
}
