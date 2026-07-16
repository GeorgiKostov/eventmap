'use client';
import { useState } from 'react';
import { STRINGS } from '../lib/i18n.js';
import { track } from '../lib/analytics.js';

// Newsletter signup for the PUBLIC server-rendered pages — the weekend digest
// pages and the event pages (George: "add newsletter subscription at the bottom
// so users can subscribe if they like what they see right there").
//
// Those pages are the SEO surface: someone lands on "Was ist los in Linz am
// Wochenende", reads nine good picks, and until now had nowhere to say "yes,
// weekly please" — they had to find their way to the map and wait for a popup.
//
// Two things make this different from the map's signup form (app/page.js), and
// both come from the page already knowing WHICH city it is about:
//   - No area picker. The page's own channel IS the area, so the only field is
//     an email. The whole point is that it costs one tap at the moment of
//     intent; a geocoding autocomplete here would throw the intent away.
//   - The area is still stated in plain words above the button, because a
//     silent prefill would sign someone up for a city they never chose.
//
// Copy is reused from lib/i18n.js (the same strings as the map form), so the
// consent wording that NL_CONSENT_VERSION stamps as proof stays one text, in
// one place, across every surface that can create a subscriber.
// `title` overrides the generic i18n headline for pages that have something more
// contextual to say (the weekend page's "these tips, every week, by email" —
// which only makes sense directly under the tips themselves).
export default function NewsletterSignup({ lang = 'en', area, source, title }) {
  const t = STRINGS[lang] || STRINGS.en;
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ busy: false, done: false, err: null });

  async function submit(e) {
    e.preventDefault();
    if (state.busy) return;
    setState({ busy: true, done: false, err: null });
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Okolo-Lang': lang },
        body: JSON.stringify({
          email: email.trim(),
          lang,
          areaLabel: area.label,
          areaLat: area.lat,
          areaLng: area.lng,
          radiusKm: 20,
          categories: [],
          source,
        }),
      });
      const data = await res.json().catch(() => ({}));
      // The route answers 503 when no mail provider took the confirmation, on
      // purpose — never tell someone to check an inbox for a mail that was
      // never sent (lib/mail.js / the route's own comment). So: only a real
      // ok:true earns the "check your inbox" state.
      if (!res.ok) throw new Error(data.error || t.requestFailed);
      track('newsletter_signup', { source });
      setState({ busy: false, done: true, err: null });
    } catch (err) {
      setState({ busy: false, done: false, err: String(err.message || err) });
    }
  }

  if (state.done) {
    return (
      <section className="pagenl">
        <p className="pagenl-done">{t.nlConfirmSent}</p>
      </section>
    );
  }

  return (
    <section className="pagenl">
      <h2 className="pagenl-title">{title || t.nlTitle}</h2>
      <p className="pagenl-blurb">{t.nlBlurb}</p>
      <form className="pagenl-form" onSubmit={submit}>
        <label className="pagenl-label" htmlFor="pagenl-email">{t.nlEmail}</label>
        <div className="pagenl-row">
          <input
            id="pagenl-email"
            className="pagenl-input"
            type="email"
            required
            autoComplete="email"
            placeholder={t.nlPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state.busy}
          />
          <button className="pagenl-btn" type="submit" disabled={state.busy}>
            {state.busy ? t.nlSending : t.nlSubmit}
          </button>
        </div>
        {/* Never a silent prefill: they see the city they are signing up for. */}
        <p className="pagenl-area">{t.nlArea}: <strong>{area.label}</strong></p>
        {state.err && <p className="pagenl-err">{state.err}</p>}
        <p className="pagenl-consent">
          {t.nlConsent}{' '}
          <a href="/datenschutz">{t.privacyLink}</a>.
        </p>
      </form>
    </section>
  );
}
