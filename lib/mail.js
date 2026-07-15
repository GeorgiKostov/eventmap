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
async function deliver({ to, subject, text, html, headers }) {
  if (!to) return false;

  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
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

export async function notifyNewSubscriber(email, { lang, source } = {}) {
  await notifyOperator(
    `Neue Newsletter-Anmeldung: ${email}`,
    `${email} hat sich für den Okolo-Newsletter angemeldet.\n\nSprache: ${lang || '—'}\nQuelle: ${source || '—'}`
  );
}

// Weekly digest send. Carries RFC-8058 one-click unsubscribe headers
// (List-Unsubscribe + List-Unsubscribe-Post) — Gmail/Yahoo require them for
// bulk senders, and they close one of the consent gaps tracked in tasks/todo.md.
// The POST target is our existing token route, so the header and the in-body
// link revoke the same subscription.
export async function sendNewsletter({ to, subject, html, text, unsubscribeUrl }) {
  return deliver({
    to,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

// `valid` mirrors CONFIRM_TTL_DAYS in lib/db.js — keep the two in sync.
const CONFIRM_COPY = {
  de: { subject: 'Bitte bestätige deine Newsletter-Anmeldung', line: 'Bitte bestätige deine Anmeldung zum Okolo-Newsletter mit einem Klick:', cta: 'Anmeldung bestätigen', valid: 'Der Link ist 7 Tage gültig.', ignore: 'Wenn du das nicht warst, ignoriere diese E-Mail einfach — ohne Bestätigung senden wir nichts.' },
  en: { subject: 'Please confirm your newsletter subscription', line: 'Please confirm your Okolo newsletter subscription with one click:', cta: 'Confirm subscription', valid: 'The link is valid for 7 days.', ignore: 'If this wasn’t you, just ignore this email — we send nothing without confirmation.' },
  bg: { subject: 'Моля, потвърди абонамента си', line: 'Моля, потвърди абонамента си за бюлетина на Okolo с едно кликване:', cta: 'Потвърди абонамента', valid: 'Линкът е валиден 7 дни.', ignore: 'Ако това не си бил ти, просто игнорирай този имейл — без потвърждение не изпращаме нищо.' },
};

// Double opt-in confirmation. Returns true ONLY if a provider accepted it — the
// caller MUST NOT tell the user "check your inbox" on a false. Someone waiting
// for a mail that was never sent is worse than an honest error.
export async function sendSubscriberConfirm(email, { lang, confirmUrl } = {}) {
  const c = CONFIRM_COPY[lang] || CONFIRM_COPY.en;
  try {
    return await deliver({
      to: email,
      subject: c.subject,
      text: `${c.line}\n\n${confirmUrl}\n\n${c.valid}\n${c.ignore}`,
      html: `<p>${c.line}</p><p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#C93A5B;color:#fff;border-radius:8px;text-decoration:none">${c.cta}</a></p><p style="color:#667">${c.valid} ${c.ignore}</p>`,
    });
  } catch (err) {
    console.error('[mail] subscriber confirm failed:', err?.message || err);
    return false;
  }
}
