import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { Fragment } from 'react';
import { Intro } from './scenes/Intro';
import { MapScene } from './scenes/MapScene';
import { EventCard } from './scenes/EventCard';
import { Outro } from './scenes/Outro';
import { T, type ReelProps } from './types';

// Weekly 9:16 reel: intro → map with the picks as pins → one card per pick →
// outro with the link. Everything comes from the frozen digest (props), so the
// reel cannot disagree with the carousel / newsletter / weekend page.
export const MAX_CARDS = 8;

export const reelDuration = (data: ReelProps) => {
  const cards = Math.min(data.items.length, MAX_CARDS);
  const scenes = T.intro + T.map + cards * T.card + T.outro;
  // cards + 3 scenes → cards + 2 transitions, each overlapping two scenes.
  return scenes - (cards + 2) * T.transition;
};

const timing = linearTiming({ durationInFrames: T.transition });

export const Reel: React.FC<{ data: ReelProps }> = ({ data }) => {
  const items = data.items.slice(0, MAX_CARDS);
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence name="Intro" durationInFrames={T.intro}>
        <Intro data={data} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence name="Map" durationInFrames={T.map}>
        <MapScene data={data} />
      </TransitionSeries.Sequence>
      {items.map((it, i) => (
        <Fragment key={it.id}>
          <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
          <TransitionSeries.Sequence name={`Pick ${i + 1}`} durationInFrames={T.card}>
            <EventCard data={data} item={it} n={i + 1} />
          </TransitionSeries.Sequence>
        </Fragment>
      ))}
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence name="Outro" durationInFrames={T.outro}>
        <Outro data={data} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
