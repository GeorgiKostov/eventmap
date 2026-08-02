import { ImageResponse } from 'next/og';
import { getEvent } from '../../../lib/db.js';

export const alt = 'Okolo event details';
export const size = { width: 1200, height: 675 };
export const contentType = 'image/png';
export const revalidate = 86400;

export default async function EventImage({ params }) {
  const { id } = await params;
  const ev = await getEvent(id);
  const title = ev?.title || 'Okolo';
  const displayTitle = title.length > 130 ? `${title.slice(0, 127).trimEnd()}…` : title;
  const titleSize = displayTitle.length > 100 ? 44 : displayTitle.length > 70 ? 50 : displayTitle.length > 40 ? 56 : 64;
  const date = ev?.starts_at?.slice(0, 10) || '';
  const place = [ev?.venue, ev?.town].filter(Boolean).join(' · ');

  return new ImageResponse(
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '72px 78px', color: '#212B28',
        background: 'linear-gradient(145deg, #FFFDF8 0%, #FCE9EE 100%)',
        fontFamily: 'sans-serif', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 800 }}>
        okolo<span style={{ color: '#C93A5B' }}>.</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 1.08, fontWeight: 800, maxWidth: 1040 }}>
          {displayTitle}
        </div>
        {(date || place) && (
          <div style={{ display: 'flex', fontSize: 30, color: '#4A5652' }}>
            {[date, place].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 27, fontWeight: 700, color: '#C93A5B' }}>
        Events around you
      </div>
    </div>,
    size,
  );
}
