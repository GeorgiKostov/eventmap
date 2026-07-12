'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LANGS, STRINGS } from '../lib/i18n.js';

const LanguageContext = createContext(null);
const LANG_COOKIE = 'okolo-lang';
const STORAGE_KEY = 'okolo-lang';
const LEGACY_STORAGE_KEY = 'umkreis-lang';

function persistLanguage(lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  document.cookie = `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

export default function LanguageProvider({ initialLang = 'en', children }) {
  const [lang, setLang] = useState(LANGS.includes(initialLang) ? initialLang : 'en');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (LANGS.includes(saved) && saved !== lang) setLang(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function chooseLanguage(nextLang) {
    if (!LANGS.includes(nextLang)) return;
    setLang(nextLang);
    persistLanguage(nextLang);
  }

  const value = useMemo(() => ({ lang, t: STRINGS[lang], chooseLanguage }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
