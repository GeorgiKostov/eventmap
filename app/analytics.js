'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLanguage } from './language-provider.js';
import { CONSENT_KEY, analyticsConsent, refreshAnalyticsConsent, setAnalyticsConsent, track } from '../lib/analytics.js';
import styles from './analytics.module.css';

const COPY = {
  en: { title: 'Optional usage statistics', text: 'May we send basic page and button usage to PostHog in the EU? No recordings, account details, search text or precise location. Your choice does not affect the map or newsletter. You can withdraw it here at any time.', accept: 'Allow statistics', reject: 'Reject statistics', settings: 'Privacy settings', privacy: 'Privacy policy' },
  de: { title: 'Optionale Nutzungsstatistik', text: 'Dürfen wir einfache Seitenaufrufe und Klicks an PostHog in der EU senden? Keine Aufzeichnungen, Kontodaten, Suchtexte oder genauen Standorte. Deine Wahl beeinflusst weder Karte noch Newsletter. Hier kannst du jederzeit widerrufen.', accept: 'Statistik erlauben', reject: 'Statistik ablehnen', settings: 'Datenschutzeinstellungen', privacy: 'Datenschutzerklärung' },
  bg: { title: 'Статистика по избор', text: 'Може ли да изпращаме основни посещения и кликове към PostHog в ЕС? Без записи, данни за профила, търсения или точно местоположение. Изборът не влияе на картата или бюлетина. Можеш да оттеглиш съгласието тук по всяко време.', accept: 'Разреши статистиката', reject: 'Откажи статистиката', settings: 'Настройки за поверителност', privacy: 'Политика за поверителност' },
};

// The map keeps this control in its menu, clear of filters and floating actions.
export function PrivacySettingsButton({ className, onClick, children }) {
  const { lang } = useLanguage();
  return <button type="button" className={className} onClick={() => {
    onClick?.();
    window.dispatchEvent(new Event('okolo-privacy-settings'));
  }}>{children}{(COPY[lang] || COPY.en).settings}</button>;
}

export default function Analytics() {
  const { lang } = useLanguage();
  const copy = COPY[lang] || COPY.en;
  const pathname = usePathname();
  const mapPage = pathname === '/' || pathname === '/aecfestival';
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('okolo-privacy-settings', show);
    return () => window.removeEventListener('okolo-privacy-settings', show);
  }, []);
  useEffect(() => {
    setOpen(!analyticsConsent());
    const pageview = () => track('$pageview');
    const sync = () => { setOpen(!analyticsConsent()); pageview(); };
    pageview();
    const storage = (event) => { if (event.key === CONSENT_KEY || event.key === null) { refreshAnalyticsConsent(); setOpen(!analyticsConsent()); } };
    window.addEventListener('okolo-analytics-consent', sync);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('okolo-analytics-consent', sync); window.removeEventListener('storage', storage); };
  }, [pathname]);
  if (!open && mapPage) return null;
  return <aside className={`${styles.root} ${mapPage ? styles.mapPanel : ''}`} aria-label={copy.settings}>
    {open ? <section className={styles.panel} aria-labelledby="analytics-title">
      <strong id="analytics-title">{copy.title}</strong><p>{copy.text}</p>
      <div className={styles.actions}>
        <button onClick={() => { setAnalyticsConsent('rejected'); setOpen(false); }}>{copy.reject}</button>
        <button onClick={() => { setAnalyticsConsent('accepted'); setOpen(false); }}>{copy.accept}</button>
      </div><a href="/datenschutz">{copy.privacy}</a>
    </section> : <button className={styles.settings} onClick={() => setOpen(true)}>{copy.settings}</button>}
  </aside>;
}
