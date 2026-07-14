import nodemailer from 'nodemailer';

// Notification email via Migadu SMTP. No-op unless SMTP_USER + SMTP_PASS are set
// (so local/preview don't try to send). Create an SMTP password for a mailbox in
// the Migadu admin, then set SMTP_USER / SMTP_PASS / NOTIFY_TO on Vercel.
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

// Operator notification. Awaited (serverless would kill a fire-and-forget
// before it sends) but never throws — a mail failure must not break the
// user-facing action that triggered it.
export async function notifyOperator(subject, text) {
  const t = getTransporter();
  const to = process.env.NOTIFY_TO || process.env.SMTP_USER;
  if (!t || !to) return;
  try {
    await t.sendMail({ from: `Okolo <${process.env.SMTP_USER}>`, to, subject, text });
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
  const t = getTransporter();
  if (!t) return false;
  await t.sendMail({
    from: `Okolo <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
  return true;
}

const CONFIRM_COPY = {
  de: { subject: 'Bitte bestätige deine Newsletter-Anmeldung', line: 'Bitte bestätige deine Anmeldung zum Okolo-Newsletter mit einem Klick:', cta: 'Anmeldung bestätigen', ignore: 'Wenn du das nicht warst, ignoriere diese E-Mail einfach — ohne Bestätigung senden wir nichts.' },
  en: { subject: 'Please confirm your newsletter subscription', line: 'Please confirm your Okolo newsletter subscription with one click:', cta: 'Confirm subscription', ignore: 'If this wasn’t you, just ignore this email — we send nothing without confirmation.' },
  bg: { subject: 'Моля, потвърди абонамента си', line: 'Моля, потвърди абонамента си за бюлетина на Okolo с едно кликване:', cta: 'Потвърди абонамента', ignore: 'Ако това не си бил ти, просто игнорирай този имейл — без потвърждение не изпращаме нищо.' },
};

// Double opt-in confirmation. Best-effort like the rest of mail.js: a no-op
// when SMTP isn't configured, never throws. Returns true only if actually sent.
export async function sendSubscriberConfirm(email, { lang, confirmUrl } = {}) {
  const t = getTransporter();
  if (!t) return false;
  const c = CONFIRM_COPY[lang] || CONFIRM_COPY.en;
  try {
    await t.sendMail({
      from: `Okolo <${process.env.SMTP_USER}>`,
      to: email,
      subject: c.subject,
      text: `${c.line}\n\n${confirmUrl}\n\n${c.ignore}`,
      html: `<p>${c.line}</p><p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#C93A5B;color:#fff;border-radius:8px;text-decoration:none">${c.cta}</a></p><p style="color:#667">${c.ignore}</p>`,
    });
    return true;
  } catch (err) {
    console.error('[mail] subscriber confirm failed:', err?.message || err);
    return false;
  }
}
