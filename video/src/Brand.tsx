import { FONT } from './types';

const PIN =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z';

export const PinIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path fill={color} fillRule="evenodd" d={PIN} />
  </svg>
);

export const Wordmark: React.FC<{ text: string; color: string; size?: number }> = ({
  text,
  color,
  size = 44,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.3, fontFamily: FONT }}>
    <PinIcon size={size * 1.05} color={color} />
    <div style={{ fontSize: size, fontWeight: 700, color, letterSpacing: -1 }}>{text}</div>
  </div>
);

// Category glyph (lucide-style stroke paths from lib/icons.js).
export const Glyph: React.FC<{
  paths: string[];
  size: number;
  stroke?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}> = ({ paths, size, stroke = '#fff', strokeWidth = 1.6, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);
