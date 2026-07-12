import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Okolo — Events rund um Linz';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ACCENT = '#c93a5b';
const INK = '#212b28';
const BG = '#f2f2ee';

function ring(diameter, opacity) {
  return {
    position: 'absolute',
    width: diameter,
    height: diameter,
    borderRadius: diameter,
    border: `4px solid ${ACCENT}`,
    opacity,
  };
}

function blip(top, left) {
  return {
    position: 'absolute',
    top,
    left,
    width: 26,
    height: 26,
    borderRadius: 26,
    background: INK,
  };
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 70,
          padding: '0 110px',
          background: BG,
          fontFamily: 'sans-serif',
        }}
      >
        {/* radar mark */}
        <div
          style={{
            position: 'relative',
            width: 320,
            height: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <div style={{ ...ring(320, 0.16) }} />
          <div style={{ ...ring(216, 0.4) }} />
          <div style={{ ...ring(120, 0.7) }} />
          <div
            style={{
              position: 'absolute',
              width: 66,
              height: 66,
              borderRadius: 66,
              background: ACCENT,
            }}
          />
          <div style={blip(26, 250)} />
          <div style={blip(210, 30)} />
          <div style={blip(150, 296)} />
        </div>

        {/* wordmark + tagline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 128, fontWeight: 800, color: INK, letterSpacing: -2 }}>
              okolo
            </div>
            <div style={{ fontSize: 128, fontWeight: 800, color: ACCENT, marginLeft: 4 }}>.</div>
          </div>
          <div style={{ fontSize: 40, color: INK, opacity: 0.72, marginTop: 8 }}>
            Events rund um Linz
          </div>
          <div style={{ fontSize: 26, color: ACCENT, fontWeight: 700, marginTop: 26, letterSpacing: 1 }}>
            okolo.events
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
