'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ArrowSquareOut, CaretRight, ChartLineUp, Funnel, MapPin, X } from '@phosphor-icons/react';
import { CatIcon, CATS, P } from '../../../lib/icons.js';
import { track } from '../../../lib/analytics.js';
import { useLanguage } from '../../language-provider.js';
import styles from './partner-demo.module.css';
import OkoloBrand from '../../okolo-brand.js';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEMO_SOURCE = 'partner-demo-pins';
const DEMO_PIN_LAYER = 'partner-demo-pin-symbols';
const DEMO_SELECTED_LAYER = 'partner-demo-selected-symbols';
const DEMO_HALO_LAYER = 'partner-demo-selected-halos';
const DEMO_PIN_SIZE = 28;
const DEMO_PIN_PAD = 3;
const DEMO_PIN_BOX = DEMO_PIN_SIZE + DEMO_PIN_PAD * 2;
const DEMO_HALO_SIZE = 44;
const DEMO_HALO_BOX = 46;
const DEMO_SPRITE_RATIO = 3;

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

function pinSilhouette(size) {
  const radius = size / 2;
  return `M${radius} 0A${radius} ${radius} 0 0 1 ${size} ${radius}A${radius} ${radius} 0 0 1 ${radius} ${size}L4 ${size}`
    + `A4 4 0 0 1 0 ${size - 4}L0 ${radius}A${radius} ${radius} 0 0 1 ${radius} 0Z`;
}

function demoPinSvg(category) {
  const color = CATS[category]?.color || CATS.family.color;
  const glyphSize = 15;
  const glyphOffset = DEMO_PIN_PAD + (DEMO_PIN_SIZE - glyphSize) / 2;
  const paths = (P[category] || P.family).map((path) => `<path d="${path}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DEMO_PIN_BOX}" height="${DEMO_PIN_BOX}" viewBox="0 0 ${DEMO_PIN_BOX} ${DEMO_PIN_BOX}">`
    + `<g transform="translate(${DEMO_PIN_PAD} ${DEMO_PIN_PAD})"><path d="${pinSilhouette(DEMO_PIN_SIZE)}" fill="${color}" stroke="#fff" stroke-width="2"/></g>`
    + `<g transform="translate(${glyphOffset} ${glyphOffset}) scale(${glyphSize / 24})" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
    + '</svg>';
}

function demoHaloSvg(category) {
  const color = CATS[category]?.color || CATS.family.color;
  const offset = (DEMO_HALO_BOX - DEMO_HALO_SIZE) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DEMO_HALO_BOX}" height="${DEMO_HALO_BOX}" viewBox="0 0 ${DEMO_HALO_BOX} ${DEMO_HALO_BOX}">`
    + `<g transform="translate(${offset} ${offset})"><path d="${pinSilhouette(DEMO_HALO_SIZE)}" fill="${color}"/></g></svg>`;
}

function rasterizeSprite(svg, cssSize) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(cssSize * DEMO_SPRITE_RATIO);
      canvas.height = Math.round(cssSize * DEMO_SPRITE_RATIO);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(context.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function registerDemoSprites(map) {
  const categories = [...new Set(DEMO_EVENTS.map((event) => event.category))];
  await Promise.all(categories.flatMap((category) => [
    rasterizeSprite(demoPinSvg(category), DEMO_PIN_BOX).then((data) => {
      const id = `partner-demo-pin-${category}`;
      if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: DEMO_SPRITE_RATIO });
    }),
    rasterizeSprite(demoHaloSvg(category), DEMO_HALO_BOX).then((data) => {
      const id = `partner-demo-halo-${category}`;
      if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: DEMO_SPRITE_RATIO });
    }),
  ]));
}

function pinCollection(events, selectedId) {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => ({
      type: 'Feature',
      id: event.id,
      properties: {
        id: event.id,
        category: event.category,
        partner: event.partner,
        selected: event.id === selectedId,
      },
      geometry: { type: 'Point', coordinates: [event.lng, event.lat] },
    })),
  };
}

export default function PartnerDemo() {
  const { lang, t, chooseLanguage } = useLanguage();
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const [day, setDay] = useState('all');
  const [partnerOnly, setPartnerOnly] = useState(true);
  const [selectedId, setSelectedId] = useState('sample-1');

  const visibleEvents = useMemo(() => DEMO_EVENTS.filter((event) => {
    if (partnerOnly && !event.partner) return false;
    return day === 'all' || event.day === day;
  }), [day, partnerOnly]);
  const pins = useMemo(() => pinCollection(visibleEvents, selectedId), [selectedId, visibleEvents]);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

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
    map.on('load', async () => {
      try {
        await registerDemoSprites(map);
        if (mapRef.current !== map) return;
        map.addSource(DEMO_SOURCE, { type: 'geojson', data: pinsRef.current, promoteId: 'id' });
        map.addLayer({
          id: DEMO_HALO_LAYER,
          type: 'symbol',
          source: DEMO_SOURCE,
          filter: ['==', ['get', 'selected'], true],
          layout: {
            'icon-image': ['concat', 'partner-demo-halo-', ['get', 'category']],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-anchor': 'center',
          },
          paint: { 'icon-opacity': 0.28 },
        });
        map.addLayer({
          id: DEMO_PIN_LAYER,
          type: 'symbol',
          source: DEMO_SOURCE,
          layout: {
            'icon-image': ['concat', 'partner-demo-pin-', ['get', 'category']],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-anchor': 'center',
          },
          paint: { 'icon-opacity': ['case', ['get', 'partner'], 1, 0.58] },
        });
        map.addLayer({
          id: DEMO_SELECTED_LAYER,
          type: 'symbol',
          source: DEMO_SOURCE,
          filter: ['==', ['get', 'selected'], true],
          layout: {
            'icon-image': ['concat', 'partner-demo-pin-', ['get', 'category']],
            'icon-size': 1.28,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-anchor': 'center',
          },
        });
        for (const layer of [DEMO_PIN_LAYER, DEMO_SELECTED_LAYER]) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
        }
      } catch (error) {
        console.error('[partner-demo] pin sprites', error);
      }
    });
    map.on('click', (event) => {
      const layers = [DEMO_SELECTED_LAYER, DEMO_PIN_LAYER].filter((layer) => map.getLayer(layer));
      if (!layers.length) return;
      const feature = map.queryRenderedFeatures(event.point, { layers })[0];
      const id = feature?.properties?.id;
      if (!id) return;
      setSelectedId(id);
      track('partner_demo_event_open', { event_id: id, placement: 'map' });
    });
    track('partner_demo_view', { placement: 'public_demo' });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const source = mapRef.current?.getSource(DEMO_SOURCE);
    if (source) source.setData(pins);
  }, [pins]);

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
