// Shape written by scripts/reel-props.mjs from the frozen weekend digest.
export type ReelItem = {
  id: string;
  title: string;
  when: string;
  venue: string;
  town: string;
  badges: string[];
  cat: string;
  color: string;
  glyph: string[];
  highlight: string | null;
  lat: number | null;
  lng: number | null;
};

export type ReelProps = {
  channel: {
    slug: string;
    handle: string;
    city: string;
    lang: string;
    lat: number;
    lng: number;
    radiusKm: number;
  };
  label: string;
  friday: string | null;
  items: ReelItem[];
};

export const ACCENT = '#C93A5B';
export const INK = '#212B28';
export const MUTED = '#6D7876';
export const PAPER = '#F2F2EE';
export const FONT = 'Noto Sans';

const COPY = {
  de: {
    kicker: 'Familien-Wochenende',
    ideas: (n: number) => `${n} Ideen fürs Wochenende`,
    mapTitle: 'Rund um',
    cta: 'Alle Infos & die Karte',
    bio: 'Link in Bio',
  },
  bg: {
    kicker: 'Семеен уикенд',
    ideas: (n: number) => `${n} идеи за уикенда`,
    mapTitle: 'Около',
    cta: 'Всичко на картата',
    bio: 'Линк в био',
  },
  en: {
    kicker: 'Family weekend',
    ideas: (n: number) => `${n} picks for the weekend`,
    mapTitle: 'Around',
    cta: 'All details & the map',
    bio: 'Link in bio',
  },
};

export const copyFor = (lang: string) => COPY[lang as keyof typeof COPY] ?? COPY.en;

// Reels UI (caption, buttons, progress bar) covers the bottom ~380px and the
// right ~140px; keep key content inside this box.
export const SAFE = { top: 200, bottom: 400, left: 80, right: 150 };

// Scene lengths in frames @30fps. Total is derived in Root.calculateMetadata.
export const T = { intro: 75, map: 120, card: 70, outro: 90, transition: 12 };
