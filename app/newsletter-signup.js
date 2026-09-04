'use client';
import { useState } from 'react';
import { STRINGS } from '../lib/i18n.js';
import { track } from '../lib/analytics.js';
import { NEWSLETTER_EDITIONS, newsletterEditionForPoint } from '../lib/newsletter-market.js';
import { PLACES, normalizePlace, searchPlaces } from '../lib/places.js';

// Newsletter signup for the PUBLIC server-rendered pages — the weekend digest
// pages and the event pages (George: "add newsletter subscription at the bottom
// so users can subscribe if they like what they see right there").
//
// Those pages are the SEO surface: someone lands on "Was ist los in Linz am
// Wochenende", reads nine good picks, and until now had nowhere to say "yes,
// weekly please" — they had to find their way to the map and wait for a popup.
//
// The page's own coordinates preselect a live edition when one exists. The
// visitor can still deliberately choose the launch waitlist, in which case a
// structured city is required instead of silently inferring future consent.
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
  const defaultEdition = newsletterEditionForPoint(area?.lat, area?.lng)?.slug || 'waitlist';
  const [edition, setEdition] = useState(defaultEdition);
  const [areaText, setAreaText] = useState(area?.label || '');
  const [waitlistArea, setWaitlistArea] = useState(area || null);
  const [state, setState] = useState({ busy: false, done: false, err: null, kind: null });
  const waitlist = edition === 'waitlist';

  async function submit(e) {
    e.preventDefault();
    if (state.busy) return;
    setState({ busy: true, done: false, err: null, kind: null });
    try {
      let resolvedArea = waitlist ? waitlistArea : null;
      if (waitlist && !resolvedArea?.country) {
        const exact = searchPlaces(areaText, { limit: 1 })[0];
        if (exact && normalizePlace(exact.label) === normalizePlace(areaText)) resolvedArea = exact;
      }
      if (waitlist && !resolvedArea?.country) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
          const geo = await fetch(`/api/geocode?q=${encodeURIComponent(areaText)}`, { signal: controller.signal });
          const data = await geo.json();
          resolvedArea = geo.ok ? data.result : null;
        } catch {
          resolvedArea = null;
        } finally {
          clearTimeout(timer);
        }
      }
      if (waitlist && !resolvedArea) throw new Error(t.nlAreaInvalid);
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Okolo-Lang': lang },
        body: JSON.stringify({
          email: email.trim(),
          lang,
          edition,
          ...(waitlist ? {
            areaLabel: resolvedArea.label || areaText,
            areaLat: resolvedArea.lat,
            areaLng: resolvedArea.lng,
            areaCountry: resolvedArea.country,
          } : {}),
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
      // This only proves the confirmation email was accepted by a provider.
      // newsletter_confirmed is emitted by the confirmation endpoint later.
      track('newsletter_signup_started', {
        source,
        area: waitlist ? resolvedArea.label : NEWSLETTER_EDITIONS.find((item) => item.slug === edition)?.label,
        signup_kind: data.kind,
      });
      setState({ busy: false, done: true, err: null, kind: data.kind });
    } catch (err) {
      setState({ busy: false, done: false, err: String(err.message || err), kind: null });
    }
  }

  if (state.done) {
    return (
      <section className="pagenl">
        <p className="pagenl-done">{state.kind === 'waitlist' ? t.nlWaitlistConfirmSent : t.nlConfirmSent}</p>
      </section>
    );
  }

  return (
    <section className="pagenl">
      <h2 className="pagenl-title">{title || t.nlTitle}</h2>
      <p className="pagenl-blurb">{t.nlBlurb}</p>
      <form className="pagenl-form" onSubmit={submit}>
        <label className="pagenl-label" htmlFor={`pagenl-edition-${source}`}>{t.nlEdition}</label>
        <select
          id={`pagenl-edition-${source}`}
          className="pagenl-input pagenl-select"
          value={edition}
          onChange={(e) => {
            const value = e.target.value;
            setEdition(value);
            if (value === 'waitlist' && newsletterEditionForPoint(waitlistArea?.lat, waitlistArea?.lng)) {
              setAreaText('');
              setWaitlistArea(null);
            }
          }}
          disabled={state.busy}
        >
          {NEWSLETTER_EDITIONS.map((channel) => (
            <option key={channel.slug} value={channel.slug}>{t.nlLiveEdition.replace('{city}', channel.label)}</option>
          ))}
          <option value="waitlist">{t.nlWaitlistOption}</option>
        </select>
        <p className="pagenl-area">
          {waitlist ? t.nlWaitlistHelp : t.nlEditionHelp}
        </p>
        {waitlist && (
          <>
            <label className="pagenl-label" htmlFor={`pagenl-area-${source}`}>{t.nlWaitlistArea}</label>
            <input
              id={`pagenl-area-${source}`}
              className="pagenl-input pagenl-select"
              value={areaText}
              onChange={(event) => {
                const value = event.target.value;
                const match = searchPlaces(value, { limit: 1 })[0];
                const exact = match && normalizePlace(match.label) === normalizePlace(value) ? match : null;
                setAreaText(value);
                setWaitlistArea(exact);
              }}
              list={`pagenl-cities-${source}`}
              required
            />
            <datalist id={`pagenl-cities-${source}`}>
              {PLACES.map((place) => <option key={`${place.name}-${place.region}`} value={place.name}>{place.region}</option>)}
            </datalist>
          </>
        )}
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
        {state.err && <p className="pagenl-err">{state.err}</p>}
        <p className="pagenl-consent">
          {t.nlConsent}{' '}
          <a href="/datenschutz">{t.privacyLink}</a>.
        </p>
      </form>
    </section>
  );
}
