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

// Pings the operator when someone subscribes. Awaited (serverless would kill a
// fire-and-forget before it sends) but never throws — a mail failure must not
// break the signup itself.
export async function notifyNewSubscriber(email, { lang, source } = {}) {
  const t = getTransporter();
  const to = process.env.NOTIFY_TO || process.env.SMTP_USER;
  if (!t || !to) return;
  try {
    await t.sendMail({
      from: `Okolo <${process.env.SMTP_USER}>`,
      to,
      subject: `Neue Newsletter-Anmeldung: ${email}`,
      text: `${email} hat sich für den Okolo-Newsletter angemeldet.\n\nSprache: ${lang || '—'}\nQuelle: ${source || '—'}`,
    });
  } catch (err) {
    console.error('[mail] subscriber notify failed:', err?.message || err);
  }
}
