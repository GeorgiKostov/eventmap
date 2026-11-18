import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Glyph, PinIcon, Wordmark } from '../Brand';
import { MiniMap } from '../MiniMap';
import { FONT, INK, MUTED, SAFE, type ReelItem, type ReelProps } from '../types';

// Layout (1080×1920): category-colour header with the date → a street-level
// map of WHERE it is (pin + pulse) → title and venue above the Reels caption
// zone. A pick with no coordinates falls back to a taller header, no map.
const HEADER_MAP = 600;
const MAP_H = 540;
const HEADER_NOMAP = 860;

export const EventCard: React.FC<{ data: ReelProps; item: ReelItem; n: number }> = ({ data, item, n }) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const hasMap = item.lat != null && item.lng != null;
  const header = hasMap ? HEADER_MAP : HEADER_NOMAP;

  const s = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const rise = (delay: number) => ({
    opacity: s(delay),
    transform: `translateY(${interpolate(s(delay), [0, 1], [40, 0])}px)`,
  });
  // Slow drift on the oversized glyph so a held card still moves.
  const drift = interpolate(frame, [0, durationInFrames], [0, 8]);
  const titleSize = hasMap
    ? item.title.length > 55 ? 62 : item.title.length > 30 ? 74 : 90
    : item.title.length > 55 ? 76 : item.title.length > 30 ? 92 : 108;

  const badges = item.badges.length ? (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {item.badges.map((b) => (
        <div
          key={b}
          style={{
            background: item.color,
            color: '#fff',
            fontSize: 36,
            fontWeight: 700,
            borderRadius: 999,
            padding: '12px 28px',
            border: '3px solid #fff',
          }}
        >
          {b}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <AbsoluteFill style={{ background: '#fff', fontFamily: FONT }}>
      {/* category-colour header */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: header,
          background: item.color,
          overflow: 'hidden',
        }}
      >
        <Glyph
          paths={item.glyph}
          size={hasMap ? 560 : 760}
          style={{
            position: 'absolute',
            right: -120,
            top: hasMap ? 60 : 120,
            opacity: 0.16,
            transform: `rotate(${drift}deg)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: SAFE.top,
            left: SAFE.left,
            right: SAFE.right,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Wordmark text={data.channel.handle} color="#fff" size={40} />
          <div style={{ fontSize: 40, fontWeight: 700, color: '#fff', opacity: 0.85 }}>
            {n} / {data.items.length}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: SAFE.left,
            right: SAFE.right,
            bottom: hasMap ? 50 : 70,
            fontSize: 84,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: -2,
            lineHeight: 1.1,
            ...rise(2),
          }}
        >
          {item.when}
        </div>
      </div>

      {hasMap ? (
        <div style={{ position: 'absolute', top: HEADER_MAP, left: 0 }}>
          <MiniMap
            lat={item.lat as number}
            lng={item.lng as number}
            color={item.color}
            glyph={item.glyph}
            precise={Boolean(item.precise)}
            width={width}
            height={MAP_H}
          />
          {badges ? <div style={{ position: 'absolute', top: 28, left: SAFE.left, ...rise(14) }}>{badges}</div> : null}
        </div>
      ) : null}

      {/* facts — centred between the header/map and the Reels caption zone */}
      <div
        style={{
          position: 'absolute',
          top: hasMap ? HEADER_MAP + MAP_H : HEADER_NOMAP,
          bottom: SAFE.bottom,
          left: SAFE.left,
          right: SAFE.right,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.1,
            letterSpacing: -2,
            ...rise(6),
          }}
        >
          {item.title}
        </div>
        {item.venue ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24, ...rise(10) }}>
            <PinIcon size={48} color={item.color} />
            <div style={{ fontSize: 46, color: MUTED }}>{item.venue}</div>
          </div>
        ) : null}
        {!hasMap && badges ? <div style={{ marginTop: 34, ...rise(14) }}>{badges}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
