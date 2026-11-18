import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Glyph, PinIcon, Wordmark } from '../Brand';
import { FONT, INK, MUTED, SAFE, type ReelItem, type ReelProps } from '../types';

export const EventCard: React.FC<{ data: ReelProps; item: ReelItem; n: number }> = ({ data, item, n }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const s = (delay: number) => spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const rise = (delay: number) => ({
    opacity: s(delay),
    transform: `translateY(${interpolate(s(delay), [0, 1], [40, 0])}px)`,
  });
  // Slow drift on the oversized glyph so a held card still moves.
  const drift = interpolate(frame, [0, durationInFrames], [0, 8]);
  const titleSize = item.title.length > 55 ? 76 : item.title.length > 30 ? 92 : 108;

  return (
    <AbsoluteFill style={{ background: '#fff', fontFamily: FONT }}>
      {/* category-colour header */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 860,
          background: item.color,
          overflow: 'hidden',
        }}
      >
        <Glyph
          paths={item.glyph}
          size={760}
          style={{
            position: 'absolute',
            right: -140,
            top: 120,
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
            bottom: 70,
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

      {/* facts */}
      <div
        style={{
          position: 'absolute',
          // Centre the facts between the header and the Reels caption zone.
          top: 860,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 34, ...rise(10) }}>
            <PinIcon size={50} color={item.color} />
            <div style={{ fontSize: 48, color: MUTED }}>{item.venue}</div>
          </div>
        ) : null}
        {item.badges.length ? (
          <div style={{ display: 'flex', gap: 16, marginTop: 34, flexWrap: 'wrap', ...rise(14) }}>
            {item.badges.map((b) => (
              <div
                key={b}
                style={{
                  background: item.color,
                  color: '#fff',
                  fontSize: 40,
                  fontWeight: 700,
                  borderRadius: 999,
                  padding: '14px 32px',
                }}
              >
                {b}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
