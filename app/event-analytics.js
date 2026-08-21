'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { track } from '../lib/analytics.js';

// The SEO event page is server-rendered, but its few meaningful actions still
// need first-party conversion signals. Keep the client boundary around only
// the analytics hooks/links; event facts and recommendations remain SSR HTML.
function acquisition() {
  const params = new URLSearchParams(window.location.search);
  let referringDomain = null;
  try { referringDomain = document.referrer ? new URL(document.referrer).hostname : null; } catch { /* invalid referrer */ }
  const clean = (name) => String(params.get(name) || '').slice(0, 100) || null;
  return {
    referring_domain: referringDomain,
    utm_source: clean('utm_source'),
    utm_medium: clean('utm_medium'),
    utm_campaign: clean('utm_campaign'),
  };
}

function captureOncePerSession(key, event, properties) {
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch { /* private mode: still count the impression */ }
  track(event, properties);
}

export function EventLandingView({ eventId, status, town, category, channel, highlight }) {
  useEffect(() => {
    track('event_landing_view', {
      id: eventId,
      status,
      town: town || null,
      category: category || null,
      channel: channel || null,
      ...acquisition(),
    });
    if (highlight === 'gold') {
      captureOncePerSession(`okolo:sponsored:event_page:${eventId}`, 'sponsored_impression', {
        id: eventId, tier: 'gold', surface: 'event_page', town: town || null, category: category || null,
      });
    }
  }, [eventId, status, town, category, channel, highlight]);
  return null;
}

export function SponsoredImpression({ eventId, surface, town, category }) {
  const marker = useRef(null);
  useEffect(() => {
    const element = marker.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      captureOncePerSession(`okolo:sponsored:${surface}:${eventId}`, 'sponsored_impression', {
        id: String(eventId), tier: 'gold', surface, town: town || null, category: category || null,
      });
      observer.disconnect();
    }, { threshold: 1 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [eventId, surface, town, category]);
  return <span ref={marker} aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, pointerEvents: 'none' }} />;
}

export function TrackedEventLink({ eventName, eventProps, secondaryEventName, secondaryEventProps, external = false, children, ...props }) {
  function capture() {
    track(eventName, eventProps);
    if (secondaryEventName) track(secondaryEventName, secondaryEventProps);
  }

  if (external) {
    return <a {...props} onClick={capture}>{children}</a>;
  }
  return <Link {...props} onClick={capture}>{children}</Link>;
}

// One contract for every event-page entrance to the map. Keeping the organic
// and paid signals together prevents a newly placed CTA from silently dropping
// either attribution, while `placement` shows which invitation worked.
export function MapDiscoveryLink({ eventId, status, town, highlight, placement, children, ...props }) {
  return (
    <TrackedEventLink
      {...props}
      eventName="event_map_open"
      eventProps={{
        id: String(eventId), status, town: town || null, highlight: highlight || null,
        surface: 'event_page', placement,
      }}
      secondaryEventName={highlight === 'gold' ? 'sponsored_open' : null}
      secondaryEventProps={{ id: String(eventId), tier: 'gold', surface: 'event_page', target: 'map', placement }}
    >
      {children}
    </TrackedEventLink>
  );
}
