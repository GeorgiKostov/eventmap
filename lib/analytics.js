'use client';
import posthog from 'posthog-js';
import { OKOLO_POSTHOG_HOST, OKOLO_POSTHOG_KEY } from './posthog-config.js';

// Privacy-first analytics for the validation test. No PII, no autocapture, no
// session recording — just the handful of events that answer "do people come
// back and what do they do." Disabled entirely until NEXT_PUBLIC_POSTHOG_KEY is
// set (so local dev / previews don't send data). EU-hosted by default (GDPR).
let ready = false;

const INTERNAL_KEY = 'okolo_analytics_internal';

function isProductionVisitor() {
  const host = window.location.hostname;
  if (!['okolo.events', 'www.okolo.events'].includes(host)) return false;
  if (navigator.webdriver) return false;
  try {
    const control = new URLSearchParams(window.location.search).get('okolo_internal');
    if (control === '1') localStorage.setItem(INTERNAL_KEY, '1');
    if (control === '0') localStorage.removeItem(INTERNAL_KEY);
    return localStorage.getItem(INTERNAL_KEY) !== '1';
  } catch {
    return true;
  }
}

export function initAnalytics() {
  if (ready || typeof window === 'undefined') return;
  // Only the canonical production hosts count as evidence. This excludes local
  // dev, Vercel previews, browser automation, and devices George marks via
  // ?okolo_internal=1 (use =0 once to opt that browser back in).
  if (!isProductionVisitor()) return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || OKOLO_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || OKOLO_POSTHOG_HOST,
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
  if (typeof window === 'undefined') return;
  // Child effects can run before the root Analytics effect. Lazy init prevents
  // the first landing/conversion event from disappearing in that ordering.
  if (!ready) initAnalytics();
  if (!ready) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* never let analytics break a user action */
  }
}
