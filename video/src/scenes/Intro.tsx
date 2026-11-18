import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Wordmark } from '../Brand';
import { ACCENT, FONT, SAFE, copyFor, type ReelProps } from '../types';

export const Intro: React.FC<{ data: ReelProps }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = copyFor(data.channel.lang);

  const rise = (delay: number) => {
    const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
    return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [60, 0])}px)` };
  };
  const pop = spring({ frame: frame - 28, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ background: ACCENT, fontFamily: FONT, color: '#fff' }}>
      <div
        style={{
          position: 'absolute',
          top: SAFE.top + 40,
          left: SAFE.left,
          right: SAFE.right,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={rise(0)}>
          <Wordmark text={data.channel.handle} color="#fff" size={48} />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 620,
          left: SAFE.left,
          right: SAFE.right,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 700, ...rise(4), opacity: 0.85 * rise(4).opacity }}>{c.kicker}</div>
        <div style={{ fontSize: 200, fontWeight: 700, letterSpacing: -6, lineHeight: 1.02, ...rise(9) }}>
          {data.channel.city}
        </div>
        <div style={{ fontSize: 76, fontWeight: 400, marginTop: 10, ...rise(14) }}>{data.label}</div>
        <div
          style={{
            marginTop: 70,
            alignSelf: 'flex-start',
            background: '#fff',
            color: ACCENT,
            fontSize: 48,
            fontWeight: 700,
            borderRadius: 999,
            padding: '20px 44px',
            opacity: pop,
            transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])})`,
            transformOrigin: 'left center',
          }}
        >
          {c.ideas(data.items.length)}
        </div>
      </div>
    </AbsoluteFill>
  );
};
