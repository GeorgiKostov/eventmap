'use client';

import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';

export default function AccountDialog({ open, onClose, onSignedOut, account, resumeAdd, t }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSent(false);
    if (!account) { setSubmissions([]); return; }
    setLoadingSubmissions(true);
    fetch('/api/account/submissions', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t.requestFailed);
        setSubmissions(data.submissions || []);
      })
      .catch((err) => setError(String(err.message || err)))
      .finally(() => setLoadingSubmissions(false));
  }, [open, account?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function signInWithGoogle() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/account/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', next: resumeAdd ? '/?add=1' : '/' }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || t.requestFailed);
      window.location.assign(data.url);
    } catch (err) {
      setError(String(err.message || err));
      setBusy(false);
    }
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    const normalized = email.trim();
    if (!normalized) return;
    setBusy(true); setError(''); setSent(false);
    try {
      const res = await fetch('/api/account/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized, next: resumeAdd ? '/?add=1' : '/' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.requestFailed);
      setSent(true);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/account/session', { method: 'DELETE' });
      if (!res.ok) throw new Error(t.requestFailed);
      onSignedOut(); onClose();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nl-scrim" onClick={onClose}>
      <div className="nl-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={(e) => e.stopPropagation()}>
        <button className="nl-close" onClick={onClose} aria-label={t.close}><X size={16} weight="bold" /></button>
        <div className="nl-icon">👤</div>
        <h3 id="account-title">{account ? t.accountTitle : t.signIn}</h3>

        {account ? (
          <>
            <p className="account-email">{account.email}</p>
            <h4 className="account-section-title">{t.mySubmissions}</h4>
            {loadingSubmissions ? (
              <p className="nl-blurb">{t.loading}</p>
            ) : submissions.length ? (
              <div className="account-submissions">
                {submissions.map((item) => (
                  <a key={item.id} href={`/event/${item.id}`} className="account-submission">
                    <span>{item.title}</span>
                    <small>{[item.starts_at?.slice(0, 10), item.town].filter(Boolean).join(' · ')}</small>
                  </a>
                ))}
              </div>
            ) : (
              <p className="nl-blurb">{t.noSubmissions}</p>
            )}
            <button type="button" className="account-signout" onClick={signOut} disabled={busy}>{t.signOut}</button>
          </>
        ) : (
          <>
            <p className="nl-blurb">{resumeAdd ? t.signInToAdd : t.authBlurb}</p>
            <button type="button" className="google-signin" onClick={signInWithGoogle} disabled={busy}>
              <span aria-hidden="true">G</span>{t.continueGoogle}
            </button>
            <div className="account-divider"><span>{t.or}</span></div>
            <form onSubmit={sendMagicLink}>
              <label className="nl-label" htmlFor="account-email">{t.email}</label>
              <input id="account-email" className="nl-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} />
              <button type="submit" className="nl-submit" disabled={busy || !email.trim()}>{busy ? t.nlSending : t.sendMagicLink}</button>
            </form>
            {sent && <p className="account-success">{t.magicLinkSent}</p>}
          </>
        )}
        {error && <p className="nl-error">{error}</p>}
        <p className="nl-fine">{t.accountPrivacy} <a href="/datenschutz" target="_blank" rel="noreferrer">{t.privacyLink}</a></p>
      </div>
    </div>
  );
}
