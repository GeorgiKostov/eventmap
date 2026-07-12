'use client';
import { useEffect } from 'react';
import { initAnalytics } from '../lib/analytics.js';

// Boots PostHog once on the client (no-op without NEXT_PUBLIC_POSTHOG_KEY).
export default function Analytics() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
