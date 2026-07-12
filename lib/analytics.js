'use client';
import posthog from 'posthog-js';

// Privacy-first analytics for the validation test. No PII, no autocapture, no
// session recording — just the handful of events that answer "do people come
// back and what do they do." Disabled entirely until NEXT_PUBLIC_POSTHOG_KEY is
// set (so local dev / previews don't send data). EU-hosted by default (GDPR).
let ready = false;

export function initAnalytics() {
  if (ready || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    person_profiles: 'identified_only', // anonymous by default — retention still works
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    respect_dnt: true,
    persistence: 'localStorage',
  });
  ready = true;
}

export function track(event, props) {
  if (!ready || typeof window === 'undefined') return;
  try {
    posthog.capture(event, props);
  } catch {
    /* never let analytics break a user action */
  }
}
