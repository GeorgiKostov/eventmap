import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { PinIcon } from '../Brand';
import { ACCENT, FONT, INK, MUTED, PAPER, SAFE, copyFor, type ReelProps } from '../types';

export const Outro: React.FC<{ data: ReelProps }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = copyFor(data.channel.lang);

  const drop = spring({ frame, fps, config: { damping: 9, mass: 0.8 } });
  const rise = (delay: number) => {
    const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
    return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [50, 0])}px)` };
  };

  return (
    <AbsoluteFill
      style={{
        background: PAPER,
        fontFamily: FONT,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: SAFE.bottom - SAFE.top,
      }}
    >
      <div style={{ transform: `translateY(${interpolate(drop, [0, 1], [-500, 0])}px)` }}>
        <PinIcon size={260} color={ACCENT} />
      </div>
      <div style={{ fontSize: 150, fontWeight: 700, color: INK, letterSpacing: -5, marginTop: 10, ...rise(8) }}>
        okolo
      </div>
      <div style={{ fontSize: 56, color: MUTED, marginTop: 30, ...rise(14) }}>{c.cta}</div>
      <div style={{ fontSize: 72, fontWeight: 700, color: ACCENT, marginTop: 12, ...rise(18) }}>okolo.events</div>
      <div
        style={{
          marginTop: 60,
          fontSize: 44,
          fontWeight: 700,
          color: '#fff',
          background: INK,
          borderRadius: 999,
          padding: '18px 42px',
          ...rise(24),
        }}
      >
        {c.bio} · @{data.channel.handle}
      </div>
    </AbsoluteFill>
  );
};
