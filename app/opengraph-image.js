import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Okolo — Events around you';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ACCENT = '#c93a5b';
const INK = '#212b28';
const BG = '#f2f2ee';

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
        {/* map-pin mark */}
        <svg width="300" height="300" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <path
            fill={ACCENT}
            fillRule="evenodd"
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
          />
        </svg>

        {/* wordmark + tagline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 128, fontWeight: 800, color: INK, letterSpacing: -2 }}>
            okolo
          </div>
          <div style={{ fontSize: 40, color: INK, opacity: 0.72, marginTop: 8 }}>
            Events around you
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
