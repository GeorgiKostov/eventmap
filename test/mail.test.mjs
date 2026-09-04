import test from 'node:test';
import assert from 'node:assert/strict';
import { sendNewsletter, sendNewsletterPreferencesRequest } from '../lib/mail.js';

test('Resend newsletter delivery forwards the deterministic idempotency key', async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFetch = global.fetch;
  let request;
  process.env.RESEND_API_KEY = 're_test';
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response('', { status: 200 });
  };

  try {
    const ok = await sendNewsletter({
      to: 'reader@example.com',
      subject: 'Weekend',
      text: 'Text',
      html: '<p>Text</p>',
      unsubscribeUrl: 'https://okolo.events/unsubscribe',
      idempotencyKey: 'digest-linz-2026-09-04-1',
    });
    assert.equal(ok, true);
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.headers['Idempotency-Key'], 'digest-linz-2026-09-04-1');
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});

test('preference campaign includes selection and one-click unsubscribe links', async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFetch = global.fetch;
  let request;
  process.env.RESEND_API_KEY = 're_test';
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response('', { status: 200 });
  };

  try {
    const ok = await sendNewsletterPreferencesRequest({
      to: 'reader@example.com',
      lang: 'de',
      preferencesUrl: 'https://okolo.events/newsletter/preferences?token=x',
      unsubscribeUrl: 'https://okolo.events/api/subscribe/unsubscribe?token=x',
      idempotencyKey: 'newsletter-preferences-v1-1',
    });
    const body = JSON.parse(request.options.body);
    assert.equal(ok, true);
    assert.equal(request.options.headers['Idempotency-Key'], 'newsletter-preferences-v1-1');
    assert.match(body.html, /newsletter\/preferences\?token=x/);
    assert.equal(body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});
