'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowSquareOut, CaretRight, ChartLineUp, Funnel, MapPin, X } from '@phosphor-icons/react';
import { CatIcon, CATS, catIconSvg } from '../../../lib/icons.js';
import { track } from '../../../lib/analytics.js';
import { useLanguage } from '../../language-provider.js';
import styles from './partner-demo.module.css';
import OkoloBrand from '../../okolo-brand.js';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const DEMO_EVENTS = [
  { id: 'sample-1', title: 'partnerDemoEventOpening', venue: 'partnerDemoVenueRiver', day: 'fri', time: '18:00', category: 'festival', lat: 48.3067, lng: 14.2841, partner: true },
  { id: 'sample-2', title: 'partnerDemoEventFamilyLab', venue: 'partnerDemoVenueWorkshop', day: 'sat', time: '10:00', category: 'workshop', lat: 48.3007, lng: 14.2918, partner: true },
  { id: 'sample-3', title: 'partnerDemoEventSoundGarden', venue: 'partnerDemoVenueGarden', day: 'sat', time: '14:00', category: 'music', lat: 48.3098, lng: 14.2774, partner: true },
  { id: 'sample-4', title: 'partnerDemoEventProjection', venue: 'partnerDemoVenueCourtyard', day: 'sat', time: '20:30', category: 'culture', lat: 48.3025, lng: 14.2863, partner: true },
  { id: 'sample-5', title: 'partnerDemoEventPicnic', venue: 'partnerDemoVenueMarket', day: 'sun', time: '11:00', category: 'food', lat: 48.2968, lng: 14.2817, partner: true },
  { id: 'sample-6', title: 'partnerDemoEventClosing', venue: 'partnerDemoVenueHarbour', day: 'sun', time: '18:00', category: 'festival', lat: 48.3122, lng: 14.2988, partner: true },
  { id: 'sample-nearby-1', title: 'partnerDemoNearbyMarket', venue: 'partnerDemoNearbySquare', day: 'sat', time: '09:00', category: 'market', lat: 48.2942, lng: 14.2947, partner: false },
  { id: 'sample-nearby-2', title: 'partnerDemoNearbyTheatre', venue: 'partnerDemoNearbyStage', day: 'sun', time: '15:00', category: 'family', lat: 48.3143, lng: 14.2825, partner: false },
];

const DAYS = ['all', 'fri', 'sat', 'sun'];

function markerElement(event, selected) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `${styles.marker} ${event.partner ? styles.partnerMarker : styles.nearbyMarker}${selected ? ` ${styles.selectedMarker}` : ''}`;
  element.style.setProperty('--pin-color', CATS[event.category]?.color || CATS.family.color);
  element.innerHTML = `<span>${catIconSvg(event.category, 15)}</span>`;
  return element;
}

export default function PartnerDemo() {
  const { lang, t, chooseLanguage } = useLanguage();
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [day, setDay] = useState('all');
  const [partnerOnly, setPartnerOnly] = useState(true);
  const [selectedId, setSelectedId] = useState('sample-1');

  const visibleEvents = useMemo(() => DEMO_EVENTS.filter((event) => {
    if (partnerOnly && !event.partner) return false;
    return day === 'all' || event.day === day;
  }), [day, partnerOnly]);

  const selected = DEMO_EVENTS.find((event) => event.id === selectedId) || null;

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: MAP_STYLE,
      center: [14.286, 48.304],
      zoom: 13.15,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    track('partner_demo_view', { placement: 'public_demo' });
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = visibleEvents.map((event) => {
      const element = markerElement(event, event.id === selectedId);
      element.setAttribute('aria-label', `${t[event.title]}, ${event.time}`);
      element.addEventListener('click', () => {
        setSelectedId(event.id);
        track('partner_demo_event_open', { event_id: event.id, placement: 'map' });
      });
      return new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat([event.lng, event.lat])
        .addTo(map);
    });
  }, [selectedId, t, visibleEvents]);

  function selectEvent(event, placement) {
    setSelectedId(event.id);
    mapRef.current?.flyTo({ center: [event.lng, event.lat], zoom: 14.25, essential: true });
    track('partner_demo_event_open', { event_id: event.id, placement });
  }

  function togglePartnerOnly() {
    const next = !partnerOnly;
    setPartnerOnly(next);
    if (!next) setDay('all');
    track('partner_demo_filter_toggle', { partner_only: next });
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <header className={styles.header}>
          <OkoloBrand qualifier={t.partnerDemoNotice} />
          <div className={styles.lockup}>
            <Image src="/partner-demo/sample-festival-mark.svg" alt="" width={58} height={58} priority />
            <div>
              <span>{t.partnerDemoMapBy}</span>
              <h1>{t.partnerDemoFestivalName}</h1>
              <p>{t.partnerDemoEdition}</p>
            </div>
          </div>
          <p className={styles.intro}>{t.partnerDemoIntro}</p>
          <div className={styles.actions}>
            <button className={`${styles.filterButton} ${partnerOnly ? styles.active : ''}`} onClick={togglePartnerOnly} aria-pressed={partnerOnly}>
              <Funnel size={15} weight="bold" /> {t.partnerDemoOnly}
            </button>
            <a href="mailto:hello@okolo.events?subject=Festival%20map%20partnership" onClick={() => track('partner_demo_contact', { placement: 'header' })}>
              {t.partnerDemoContact} <ArrowSquareOut size={14} />
            </a>
          </div>
        </header>

        <div className={styles.dayTabs} role="group" aria-label={t.partnerDemoDaysLabel}>
          {DAYS.map((value) => (
            <button key={value} className={day === value ? styles.dayActive : ''} onClick={() => { setDay(value); track('partner_demo_day_filter', { day: value }); }}>
              {t[`partnerDemoDay${value[0].toUpperCase()}${value.slice(1)}`]}
            </button>
          ))}
        </div>

        <div className={styles.listHead}>
          <strong>{t.partnerDemoProgramme}</strong>
          <span>{t.partnerDemoCount.replace('{n}', visibleEvents.length)}</span>
        </div>

        <div className={styles.eventList}>
          {visibleEvents.map((event) => (
            <button key={event.id} className={`${styles.eventRow} ${selectedId === event.id ? styles.eventSelected : ''}`} onClick={() => selectEvent(event, 'list')}>
              <span className={styles.eventIcon} style={{ '--category': CATS[event.category]?.color || CATS.family.color }}><CatIcon cat={event.category} size={18} /></span>
              <span className={styles.eventCopy}>
                <span className={styles.eventMeta}>{t[`partnerDemoDay${event.day[0].toUpperCase()}${event.day.slice(1)}`]} · {event.time}</span>
                <strong>{t[event.title]}</strong>
                <span>{t[event.venue]}</span>
                {event.partner && <em>{t.partnerDemoBadge}</em>}
              </span>
              <CaretRight size={17} />
            </button>
          ))}
        </div>

        <footer className={styles.footer}>
          <span>{t.partnerDemoLanguage}</span>
          <div>{['de', 'en', 'bg'].map((value) => <button key={value} className={lang === value ? styles.langActive : ''} onClick={() => chooseLanguage(value)}>{value.toUpperCase()}</button>)}</div>
          <p>{t.partnerDemoDisclaimer}</p>
        </footer>
      </aside>

      <section className={styles.mapArea} aria-label={t.mapLabel}>
        <div ref={mapNode} className={styles.map} />

        <div className={styles.benefitRail} aria-label={t.partnerDemoBenefitsLabel}>
          <span><MapPin size={16} weight="fill" /> {t.partnerDemoBenefitUrl}</span>
          <span><Funnel size={16} weight="fill" /> {t.partnerDemoBenefitFilter}</span>
          <span><ChartLineUp size={16} weight="fill" /> {t.partnerDemoBenefitMeasure}</span>
        </div>

        <div className={styles.mobileBrand}>
          <div className={styles.mobileBrandTop}>
            <OkoloBrand qualifier={t.partnerDemoNotice} />
            <button className={partnerOnly ? styles.mobileFilterActive : ''} onClick={togglePartnerOnly} aria-label={t.partnerDemoOnly}><Funnel size={18} /></button>
          </div>
          <div className={styles.mobilePartnerLockup}>
            <Image src="/partner-demo/sample-festival-mark.svg" alt="" width={34} height={34} />
            <div><small>{t.partnerDemoMapBy}</small><strong>{t.partnerDemoFestivalName}</strong></div>
          </div>
        </div>

        {selected && visibleEvents.some((event) => event.id === selected.id) && (
          <article className={styles.detail}>
            <button className={styles.close} onClick={() => setSelectedId(null)} aria-label={t.close}><X size={17} /></button>
            <div className={styles.detailBrand}><Image src="/partner-demo/sample-festival-mark.svg" alt="" width={28} height={28} /><span>{selected.partner ? t.partnerDemoBadge : t.partnerDemoNearbyBadge}</span></div>
            <span className={styles.detailMeta}>{t[`partnerDemoDay${selected.day[0].toUpperCase()}${selected.day.slice(1)}`]} · {selected.time}</span>
            <h2>{t[selected.title]}</h2>
            <p><MapPin size={15} /> {t[selected.venue]}</p>
            <p className={styles.sampleText}>{t.partnerDemoSampleDescription}</p>
            <a href="mailto:hello@okolo.events?subject=Festival%20map%20partnership" onClick={() => track('partner_demo_contact', { placement: 'detail' })}>{t.partnerDemoBuildMine}</a>
          </article>
        )}
      </section>
    </main>
  );
}
