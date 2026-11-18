import { Composition, staticFile, type CalculateMetadataFunction } from 'remotion';
import { loadFont } from '@remotion/fonts';
import { Reel, reelDuration } from './Reel';
import { FONT, type ReelProps } from './types';
// Written by `npm run reel:props` in the repo root (gitignored). Override at
// render time with --props=data/<slug>-<friday>.json.
import current from '../data/current.json';

// Noto, not a web default: Bulgarian channels need Cyrillic (same reason the
// carousel card route ships these TTFs).
loadFont({ family: FONT, url: staticFile('NotoSans-Regular.ttf'), weight: '400' });
loadFont({ family: FONT, url: staticFile('NotoSans-Bold.ttf'), weight: '700' });

type Props = { data: ReelProps };

const calculateMetadata: CalculateMetadataFunction<Props> = ({ props }) => ({
  durationInFrames: reelDuration(props.data),
});

export const RemotionRoot: React.FC = () => (
  <Composition
    id="WeekendReel"
    component={Reel}
    durationInFrames={600}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{ data: current as ReelProps }}
    calculateMetadata={calculateMetadata}
  />
);
