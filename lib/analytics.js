'use client';
import { OKOLO_POSTHOG_HOST, OKOLO_POSTHOG_KEY } from './posthog-config.js';

export const CONSENT_KEY = 'okolo_analytics_consent_2026_09';
const INTERNAL_KEY = 'okolo_analytics_internal';
let choice;
let visitorId;
const pending = new Set();
const EVENTS = new Set(('$pageview event_landing_view event_map_open event_source_open open_detail sponsored_impression sponsored_open sponsored_referral weekend_event_open weekend_map_open newsletter_signup_started nl_prompt_shown nl_prompt_accepted interest report directions calendar_add share contribution_rate_limited contribution_published event_calendar_open weekend_page_open partner_map_view partner_filter_toggle partner_program_open partner_showcase_open partner_showcase_view partner_showcase_contact partner_showcase_demo_open partner_showcase_live_proof_open partner_demo_event_open partner_demo_view partner_demo_filter_toggle partner_demo_contact partner_demo_day_filter').split(' '));
const ENUMS = {
  surface: ['map', 'event_page', 'weekend_page', 'menu', 'results', 'desktop', 'mobile'],
  placement: ['map', 'list', 'header', 'footer', 'detail', 'hero', 'nav', 'pilot', 'final', 'hero_preview', 'discovery', 'map_menu', 'html_showcase', 'public_demo', 'primary', 'secondary'],
  kind: ['event', 'place'], tier: ['gold'], target: ['source', 'map', 'google', 'outlook', 'ics'],
  status: ['upcoming', 'past', 'active', 'expired'], via: ['scan', 'link', 'form'],
  signup_kind: ['newsletter', 'waitlist', 'edition'], source: ['newsletter_popup', 'event_page', 'weekend_page'],
  reason: ['cancelled', 'wrong_time', 'wrong_info', 'not_free'],
};

export function pageType(path) {
  if (path === '/') return 'map';
  const first = path.split('/')[1];
  return ['event', 'events', 'weekend', 'partners', 'datenschutz', 'impressum'].includes(first) ? first : 'other';
}

export function sanitizeProperties(props = {}) {
  const safe = {};
  for (const [name, values] of Object.entries(ENUMS)) if (values.includes(props[name])) safe[name] = props[name];
  for (const name of ['on', 'partner_only']) if (typeof props[name] === 'boolean') safe[name] = props[name];
  // Public listing IDs only. Never accept account IDs, free text, URLs or geography.
  if (/^\d{1,16}$/.test(String(props.id || ''))) safe.id = String(props.id);
  return safe;
}

export function analyticsConsent() {
  if (choice !== undefined) return choice;
  try { choice = localStorage.getItem(CONSENT_KEY); } catch { choice = null; }
  return choice;
}

export function analyticsAllowed() {
  if (typeof window === 'undefined') return false;
  if (!['okolo.events', 'www.okolo.events'].includes(window.location.hostname)) return false;
  if (navigator.webdriver || navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return false;
  // Tokenized account and newsletter management pages never emit events.
  if (pageType(window.location.pathname) === 'other') return false;
  try {
    const control = new URLSearchParams(window.location.search).get('okolo_internal');
    if (control === '1') localStorage.setItem(INTERNAL_KEY, '1');
    if (control === '0') localStorage.removeItem(INTERNAL_KEY);
    if (localStorage.getItem(INTERNAL_KEY) === '1') return false;
  } catch { return false; }
  return analyticsConsent() === 'accepted';
}

export function refreshAnalyticsConsent() {
  choice = undefined;
  if (analyticsConsent() !== 'accepted') {
    visitorId = undefined;
    for (const controller of pending) controller.abort();
    pending.clear();
  }
}

export function setAnalyticsConsent(next) {
  choice = next === 'accepted' ? 'accepted' : 'rejected';
  try {
    localStorage.setItem(CONSENT_KEY, choice);
    // Remove only the previous project's persistent SDK identity.
    localStorage.removeItem(`ph_${OKOLO_POSTHOG_KEY}_posthog`);
  } catch { /* current-page consent remains usable */ }
  if (choice === 'rejected') {
    visitorId = undefined;
    for (const controller of pending) controller.abort();
    pending.clear();
  }
  window.dispatchEvent(new Event('okolo-analytics-consent'));
}

export function initAnalytics() {
  // No SDK: no autocapture, replay, flags, cookies, referrer or device enrichment.
  if (!analyticsAllowed()) return;
  visitorId ||= crypto.randomUUID();
}

export function track(event, props) {
  if (!EVENTS.has(event) || !analyticsAllowed()) return false;
  initAnalytics();
  const controller = new AbortController();
  pending.add(controller);
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const body = JSON.stringify({
      api_key: OKOLO_POSTHOG_KEY, event, distinct_id: visitorId,
      properties: { ...sanitizeProperties(props), page_type: pageType(window.location.pathname),
        $process_person_profile: false, $geoip_disable: true, $ip: null, integration_version: 'consent-2026-09-12' },
    });
    // text/plain avoids a preflight; the ingestion API parses the JSON body.
    fetch(`${OKOLO_POSTHOG_HOST}/i/v0/e/`, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body, credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, signal: controller.signal })
      .catch(() => {}).finally(() => { clearTimeout(timeout); pending.delete(controller); });
    return true;
  } catch {
    clearTimeout(timeout); pending.delete(controller); return false;
  }
}
