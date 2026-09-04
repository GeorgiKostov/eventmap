'use client';

import { useState } from 'react';
import { STRINGS } from '../../../lib/i18n.js';
import { NEWSLETTER_EDITIONS } from '../../../lib/newsletter-market.js';
import { PLACES, normalizePlace, searchPlaces } from '../../../lib/places.js';

export default function NewsletterPreferencesForm({ token, lang, current }) {
  const t = STRINGS[lang] || STRINGS.en;
  const initialEdition = current.subscriptionKind === 'edition' && current.channelSlug
    ? current.channelSlug
    : 'waitlist';
  const initialKnown = searchPlaces(current.areaLabel || '', { limit: 1 })[0] || null;
  const [edition, setEdition] = useState(initialEdition);
  const [area, setArea] = useState(current.areaLabel || '');
  const [location, setLocation] = useState(current.areaLat != null && current.areaLng != null
    ? { label: current.areaLabel, lat: current.areaLat, lng: current.areaLng, country: current.areaCountry || initialKnown?.country || null }
    : null);
  const [state, setState] = useState({ busy: false, done: false, kind: null, error: '' });
  const waitlist = edition === 'waitlist';

  function changeArea(value) {
    const match = searchPlaces(value, { limit: 1 })[0];
    const exact = match && normalizePlace(match.label) === normalizePlace(value) ? match : null;
    setArea(value);
    setLocation(exact ? { label: exact.label, lat: exact.lat, lng: exact.lng, country: exact.country } : null);
    setState((s) => ({ ...s, error: '' }));
  }

  function changeEdition(value) {
    setEdition(value);
    if (value === 'waitlist' && current.subscriptionKind === 'edition') {
      setArea('');
      setLocation(null);
    }
    setState((s) => ({ ...s, error: '' }));
  }

  async function resolveArea() {
    if (location?.country) return location;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(area)}`, { signal: controller.signal });
      const data = await response.json();
      return response.ok ? data.result : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setState({ busy: true, done: false, kind: null, error: '' });
    try {
      const resolved = waitlist ? await resolveArea() : null;
      if (waitlist && !resolved) throw new Error(t.nlAreaInvalid);
      const response = await fetch('/api/subscribe/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Okolo-Lang': lang },
        body: JSON.stringify({
          token,
          edition,
          ...(waitlist ? {
            areaLabel: resolved.label || area,
            areaLat: resolved.lat,
            areaLng: resolved.lng,
            areaCountry: resolved.country,
          } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t.requestFailed);
      setState({ busy: false, done: true, kind: data.kind, error: '' });
    } catch (error) {
      setState({ busy: false, done: false, kind: null, error: String(error.message || error) });
    }
  }

  if (state.done) {
    return <p className="newsletter-preferences-success">{state.kind === 'waitlist' ? t.nlWaitlistThanks : t.nlThanks}</p>;
  }

  return (
    <form className="newsletter-preferences-form" onSubmit={submit}>
      <label className="nl-field">
        <span>{t.nlEdition}</span>
        <select className="nl-input" value={edition} onChange={(event) => changeEdition(event.target.value)}>
          {NEWSLETTER_EDITIONS.map((channel) => (
            <option key={channel.slug} value={channel.slug}>{t.nlLiveEdition.replace('{city}', channel.label)}</option>
          ))}
          <option value="waitlist">{t.nlWaitlistOption}</option>
        </select>
        <small>{waitlist ? t.nlWaitlistHelp : t.nlEditionHelp}</small>
      </label>
      {waitlist && (
        <label className="nl-field">
          <span>{t.nlWaitlistArea}</span>
          <input className="nl-input" value={area} onChange={(event) => changeArea(event.target.value)} list="preference-cities" required />
          <datalist id="preference-cities">
            {PLACES.map((place) => <option key={`${place.name}-${place.region}`} value={place.name}>{place.region}</option>)}
          </datalist>
          <small>{t.nlAreaHelp}</small>
        </label>
      )}
      <button className="nl-submit" type="submit" disabled={state.busy}>{state.busy ? t.nlSending : t.nlPreferenceSave}</button>
      {state.error && <p className="nl-err">{state.error}</p>}
      <p className="nl-fine">{t.nlConsent} <a href="/datenschutz">{t.privacyLink}</a>.</p>
    </form>
  );
}
