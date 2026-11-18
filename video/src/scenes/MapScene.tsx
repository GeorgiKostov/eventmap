import { useEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from 'remotion';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Glyph } from '../Brand';
import { ACCENT, FONT, INK, SAFE, copyFor, type ReelProps } from '../types';

// Same free basemap the app uses (app/page.js). OpenFreeMap requires visible
// OpenMapTiles + OpenStreetMap attribution, drawn bottom-left below.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

type Pt = { x: number; y: number };

export const MapScene: React.FC<{ data: ReelProps }> = ({ data }) => {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading map'));
  const [pts, setPts] = useState<(Pt | null)[] | null>(null);
  const c = copyFor(data.channel.lang);

  useEffect(() => {
    if (!ref.current) return;
    // No setWorkerUrl: the default maplibre-gl build inlines its worker, which
    // works in headless render (an ESM worker blob from unpkg did not).
    const pinned = data.items.filter((it) => it.lat != null && it.lng != null);
    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([data.channel.lng, data.channel.lat]);
    for (const it of pinned) bounds.extend([it.lng as number, it.lat as number]);

    const map = new maplibregl.Map({
      container: ref.current,
      style: MAP_STYLE,
      bounds,
      // Room for the title (top) and the Reels UI (bottom / right).
      fitBoundsOptions: {
        padding: { top: SAFE.top + 320, bottom: SAFE.bottom + 80, left: SAFE.left + 60, right: SAFE.right + 60 },
        maxZoom: 12,
      },
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.on('load', () => {
      map.once('idle', () => {
        setPts(
          data.items.map((it) =>
            it.lat != null && it.lng != null ? map.project([it.lng, it.lat]) : null,
          ),
        );
        continueRender(handle);
      });
    });
  }, [continueRender, handle, data]);

  // Gentle push-in on the whole plate (pins included) instead of moving the
  // live camera per frame — avoids tile shimmer in the render.
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.06]);
  const head = spring({ frame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: '#e8e4da', fontFamily: FONT }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <div ref={ref} style={{ position: 'absolute', width, height }} />
        {pts?.map((p, i) => {
          if (!p) return null;
          const it = data.items[i];
          const s = spring({ frame: frame - 14 - i * 9, fps, config: { damping: 10, mass: 0.7 } });
          return (
            <div
              key={it.id}
              style={{
                position: 'absolute',
                left: p.x - 48,
                top: p.y - 116,
                width: 96,
                height: 116,
                opacity: Math.min(1, s * 2),
                transform: `translateY(${interpolate(s, [0, 1], [-220, 0])}px)`,
                transformOrigin: '50% 100%',
              }}
            >
              <svg width={96} height={116} viewBox="0 0 96 116" style={{ position: 'absolute' }}>
                <path
                  d="M48 114C48 114 6 70 6 46a42 42 0 0 1 84 0c0 24-42 68-42 68z"
                  fill={it.color}
                  stroke="#fff"
                  strokeWidth={5}
                />
              </svg>
              <div style={{ position: 'absolute', left: 22, top: 20 }}>
                <Glyph paths={it.glyph} size={52} strokeWidth={2.2} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  right: -14,
                  top: -12,
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  background: INK,
                  color: '#fff',
                  fontSize: 28,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '3px solid #fff',
                }}
              >
                {i + 1}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* title card */}
      <div
        style={{
          position: 'absolute',
          top: SAFE.top,
          left: SAFE.left,
          right: SAFE.right,
          background: '#fff',
          borderRadius: 36,
          padding: '34px 44px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          opacity: head,
          transform: `translateY(${interpolate(head, [0, 1], [-60, 0])}px)`,
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 700, color: ACCENT }}>{data.label}</div>
        <div style={{ fontSize: 84, fontWeight: 700, color: INK, letterSpacing: -2, lineHeight: 1.05 }}>
          {c.mapTitle} {data.channel.city}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 24,
          bottom: 18,
          fontSize: 20,
          color: '#333',
          background: 'rgba(255,255,255,0.75)',
          padding: '4px 10px',
          borderRadius: 6,
        }}
      >
        © OpenFreeMap © OpenMapTiles © OpenStreetMap contributors
      </div>
    </AbsoluteFill>
  );
};
