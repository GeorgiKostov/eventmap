import nodemailer from 'nodemailer';

// ONE place decides how mail leaves the building — feature code never learns
// which provider we use (same rule as the model routing in lib/extract.js).
//
//   1. Resend (RESEND_API_KEY) — an HTTP API, so it works on serverless without
//      an outbound SMTP socket, and it handles SPF/DKIM/DMARC for us. Preferred:
//      transactional deliverability is a specialist job, and a confirmation mail
//      that lands in spam is the same as no confirmation mail.
//   2. SMTP (SMTP_USER + SMTP_PASS) — Migadu or any host. The fallback.
//   3. Nothing configured — mailConfigured() is false, and every caller must
//      treat that as "cannot send", never as "sent".
//
// MAIL_FROM sets the visible sender ("Okolo <hello@okolo.events>"). With Resend
// the domain has to be verified in their dashboard first, or the send 403s.

export function mailConfigured() {
  return !!process.env.RESEND_API_KEY || !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress() {
  return process.env.MAIL_FROM || `Okolo <${process.env.SMTP_USER || 'hello@okolo.events'}>`;
}

let transporter;
function getTransporter() {
  if (transporter !== undefined) return transporter;
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return null;
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.migadu.com',
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// Send one mail. Returns true only if a provider actually accepted it — the
// return value is load-bearing: callers use it to decide what to tell the user,
// so "no provider configured" must never look like success.
async function deliver({ to, subject, text, html, headers, idempotencyKey }) {
  if (!to) return false;

  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, text, html, headers }),
    });
    if (res.ok) return true;
    // Don't fall through to SMTP on a Resend failure: a 403 (unverified domain)
    // would otherwise be masked by a second provider quietly succeeding, and
    // we'd never learn the primary path is broken.
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }

  const t = getTransporter();
  if (!t) return false;
  await t.sendMail({ from: fromAddress(), to, subject, text, html, headers });
  return true;
}

// Operator notification. Awaited (serverless would kill a fire-and-forget
// before it sends) but never throws — a mail failure must not break the
// user-facing action that triggered it.
export async function notifyOperator(subject, text) {
  const to = process.env.NOTIFY_TO || process.env.SMTP_USER;
  // Resend-only deployments have no SMTP_USER, so without NOTIFY_TO every
  // operator ping (new-subscriber, new-submission) evaporates without a trace.
  // Say so in the logs — a missing notification looks exactly like no signups.
  if (!to) {
    console.warn('[mail] operator notify skipped — set NOTIFY_TO (no SMTP_USER to fall back to)');
    return;
  }
  try {
    await deliver({ to, subject, text });
  } catch (err) {
    console.error('[mail] operator notify failed:', err?.message || err);
  }
}

export async function notifyNewSubscriber(email, { lang, source, areaLabel, kind } = {}) {
  await notifyOperator(
    `Neue Newsletter-Anmeldung: ${email}`,
    `${email} hat sich bei Okolo angemeldet.\n\nTyp: ${kind || '—'}\nOrt: ${areaLabel || '—'}\nSprache: ${lang || '—'}\nQuelle: ${source || '—'}`
  );
}

// Weekly digest send. Carries RFC-8058 one-click unsubscribe headers
// (List-Unsubscribe + List-Unsubscribe-Post) — Gmail/Yahoo require them for
// bulk senders, and they close one of the consent gaps tracked in tasks/todo.md.
// The POST target is our existing token route, so the header and the in-body
// link revoke the same subscription.
export async function sendNewsletter({ to, subject, html, text, unsubscribeUrl, idempotencyKey }) {
  return deliver({
    to,
    subject,
    text,
    html,
    idempotencyKey,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

// `valid` mirrors CONFIRM_TTL_DAYS in lib/db.js — keep the two in sync.
const CONFIRM_COPY = {
  de: {
    edition: { subject: 'Bitte bestätige deine Newsletter-Anmeldung', line: 'Bitte bestätige deine Anmeldung zum Okolo-Wochenend-Newsletter mit einem Klick:', cta: 'Newsletter bestätigen' },
    waitlist: { subject: 'Bitte bestätige deine Stadt-Benachrichtigung', line: 'Bitte bestätige, dass wir dich einmalig benachrichtigen dürfen, sobald Okolo in deiner Stadt startet:', cta: 'Benachrichtigung bestätigen' },
    valid: 'Der Link ist 7 Tage gültig.', ignore: 'Wenn du das nicht warst, ignoriere diese E-Mail einfach — ohne Bestätigung senden wir nichts.',
  },
  en: {
    edition: { subject: 'Please confirm your newsletter subscription', line: 'Please confirm your Okolo weekend newsletter subscription with one click:', cta: 'Confirm newsletter' },
    waitlist: { subject: 'Please confirm your city notification', line: 'Please confirm that we may notify you once when Okolo launches in your city:', cta: 'Confirm notification' },
    valid: 'The link is valid for 7 days.', ignore: 'If this wasn’t you, just ignore this email — we send nothing without confirmation.',
  },
  bg: {
    edition: { subject: 'Моля, потвърди абонамента си', line: 'Потвърди абонамента си за уикенд бюлетина на Okolo с едно кликване:', cta: 'Потвърди бюлетина' },
    waitlist: { subject: 'Потвърди известието за твоя град', line: 'Потвърди, че можем да те уведомим еднократно, когато Okolo стартира в твоя град:', cta: 'Потвърди известието' },
    valid: 'Линкът е валиден 7 дни.', ignore: 'Ако това не си бил ти, просто игнорирай този имейл — без потвърждение не изпращаме нищо.',
  },
};

// Double opt-in confirmation. Returns true ONLY if a provider accepted it — the
// caller MUST NOT tell the user "check your inbox" on a false. Someone waiting
// for a mail that was never sent is worse than an honest error.
export async function sendSubscriberConfirm(email, { lang, confirmUrl, waitlist = false } = {}) {
  const c = CONFIRM_COPY[lang] || CONFIRM_COPY.en;
  const message = waitlist ? c.waitlist : c.edition;
  try {
    return await deliver({
      to: email,
      subject: message.subject,
      text: `${message.line}\n\n${confirmUrl}\n\n${c.valid}\n${c.ignore}`,
      html: `<p>${message.line}</p><p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#C93A5B;color:#fff;border-radius:8px;text-decoration:none">${message.cta}</a></p><p style="color:#667">${c.valid} ${c.ignore}</p>`,
    });
  } catch (err) {
    console.error('[mail] subscriber confirm failed:', err?.message || err);
    return false;
  }
}

const PREFERENCES_COPY = {
  de: {
    subject: 'Welche Okolo-Ausgabe möchtest du?',
    line: 'Der Okolo-Newsletter startet derzeit mit Linz & Umgebung. Bitte wähle deine Ausgabe. Wenn deine Stadt noch nicht dabei ist, benachrichtigen wir dich auf Wunsch einmalig zum Start.',
    cta: 'Ausgabe oder Stadt wählen',
    why: 'Du bekommst diese E-Mail, weil du deine Okolo-Anmeldung bereits bestätigt hast.',
    unsub: 'Abmelden',
  },
  en: {
    subject: 'Which Okolo edition would you like?',
    line: 'The Okolo newsletter currently starts with Linz & surroundings. Please choose your edition. If your city is not available yet, we can notify you once when it launches.',
    cta: 'Choose edition or city',
    why: 'You are receiving this because you previously confirmed your Okolo subscription.',
    unsub: 'Unsubscribe',
  },
  bg: {
    subject: 'Кое издание на Okolo искаш?',
    line: 'Бюлетинът на Okolo в момента стартира за Линц и околността. Избери издание. Ако твоят град още не е наличен, можем да те уведомим еднократно при старта.',
    cta: 'Избери издание или град',
    why: 'Получаваш този имейл, защото вече потвърди регистрацията си в Okolo.',
    unsub: 'Отписване',
  },
};

export async function sendNewsletterPreferencesRequest({ to, lang, preferencesUrl, unsubscribeUrl, idempotencyKey }) {
  const c = PREFERENCES_COPY[lang] || PREFERENCES_COPY.en;
  return deliver({
    to,
    subject: c.subject,
    text: `${c.line}\n\n${c.cta}: ${preferencesUrl}\n\n${c.why}\n${c.unsub}: ${unsubscribeUrl}`,
    html: `<p>${c.line}</p><p><a href="${preferencesUrl}" style="display:inline-block;padding:11px 18px;background:#C93A5B;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">${c.cta}</a></p><p style="color:#667;font-size:13px">${c.why}<br><a href="${unsubscribeUrl}" style="color:#667">${c.unsub}</a></p>`,
    idempotencyKey,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
