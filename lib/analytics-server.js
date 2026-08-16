import { OKOLO_POSTHOG_HOST, OKOLO_POSTHOG_KEY } from './posthog-config.js';

// Server-side conversion capture is deliberately production-only. Builds,
// previews and local confirmation-route checks must not become partner proof.
export function serverAnalyticsEnabled(env = process.env) {
  return env.VERCEL_ENV === 'production' && Boolean(env.NEXT_PUBLIC_POSTHOG_KEY || OKOLO_POSTHOG_KEY);
}

export async function captureServer(event, { distinctId, properties = {} } = {}) {
  if (!serverAnalyticsEnabled() || !event || !distinctId) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || OKOLO_POSTHOG_HOST;
    const response = await fetch(`${host.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.NEXT_PUBLIC_POSTHOG_KEY || OKOLO_POSTHOG_KEY,
        event,
        properties: {
          distinct_id: distinctId,
          $process_person_profile: false,
          ...properties,
        },
      }),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    // A measurement outage must never block a consent confirmation.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

