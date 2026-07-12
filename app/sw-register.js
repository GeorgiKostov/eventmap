'use client';
import { useEffect } from 'react';

// Registers the service worker so Okolo is installable as an app on Android/iOS.
export default function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
