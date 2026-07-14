import { ImageResponse } from 'next/og';
import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { getChannel } from '../../../../lib/city-channels.js';
import { loadOrBuildDigest } from '../../../../lib/digest.js';
import { CATS } from '../../../../lib/icons.js';

// Weekly social carousel: one 1080×1350 (Instagram portrait) PNG per slide,
// rendered from OUR data with OUR template. Slide 0 is the cover, slides 1..N
// are the picks. Never a source's poster or prose — the art is ours and the
// facts are ours (hard rule 1).
//
// Node runtime, not edge: it reads the digest snapshot from Postgres (the same
// frozen pick set the newsletter uses) and the Noto TTFs from disk. Noto is
// required, not decorative — Bulgarian cards are Cyrillic, and next/og's
// default font has no Cyrillic coverage (it would render tofu boxes).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1080, height: 1350 };
const ACCENT = '#C93A5B';
const INK = '#212B28';
const MUTED = '#4A5652';
const PAPER = '#F2F2EE';

let fontCache;
async function fonts() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), 'public', 'fonts');
  const [regular, bold] = await Promise.all([
    fs.readFile(path.join(dir, 'NotoSans-Regular.ttf')),
    fs.readFile(path.join(dir, 'NotoSans-Bold.ttf')),
  ]);
  fontCache = [
    { name: 'Noto Sans', data: regular, weight: 400, style: 'normal' },
    { name: 'Noto Sans', data: bold, weight: 700, style: 'normal' },
  ];
  return fontCache;
}

const COVER = {
  de: { kicker: 'Familien-Wochenende', cta: 'Alle Infos & Karte auf okolo.events' },
  bg: { kicker: 'Семеен уикенд', cta: 'Всичко на картата: okolo.events' },
  en: { kicker: 'Family weekend', cta: 'Everything on the map: okolo.events' },
};

function Frame({ children }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        padding: 72,
        fontFamily: 'Noto Sans',
      }}
    >
      {children}
    </div>
  );
}

function Wordmark({ color = INK }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="44" height="44" viewBox="0 0 24 24">
        <path
          fill={ACCENT}
          fillRule="evenodd"
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
        />
      </svg>
      <div style={{ fontSize: 40, fontWeight: 700, color, letterSpacing: -1 }}>okolo</div>
    </div>
  );
}

function coverSlide(digest) {
  const c = COVER[digest.channel.lang] || COVER.en;
  return (
    <Frame>
      <Wordmark />
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: ACCENT, letterSpacing: 1 }}>{c.kicker}</div>
        <div style={{ fontSize: 116, fontWeight: 700, color: INK, letterSpacing: -3, lineHeight: 1.05, marginTop: 10 }}>
          {digest.channel.label}
        </div>
        <div style={{ fontSize: 54, fontWeight: 400, color: MUTED, marginTop: 18 }}>{digest.label}</div>
        <div
          style={{
            display: 'flex',
            marginTop: 44,
            background: ACCENT,
            color: '#fff',
            fontSize: 34,
            fontWeight: 700,
            borderRadius: 999,
            padding: '20px 38px',
            alignSelf: 'flex-start',
          }}
        >
          {digest.items.length} {digest.channel.lang === 'bg' ? 'идеи' : digest.channel.lang === 'de' ? 'Ideen' : 'picks'}
        </div>
      </div>
      <div style={{ fontSize: 30, color: MUTED, display: 'flex' }}>{c.cta}</div>
    </Frame>
  );
}

function eventSlide(digest, item, n) {
  const color = CATS[item.cat]?.color || ACCENT;
  return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark />
        <div style={{ fontSize: 30, fontWeight: 700, color: MUTED, display: 'flex' }}>
          {n} / {digest.items.length}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', marginBottom: 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            background: color,
            color: '#fff',
            fontSize: 30,
            fontWeight: 700,
            borderRadius: 999,
            padding: '14px 28px',
          }}
        >
          {item.when}
        </div>
        <div
          style={{
            fontSize: item.title.length > 46 ? 62 : 78,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.12,
            letterSpacing: -1.5,
            marginTop: 26,
          }}
        >
          {item.title}
        </div>
        {item.venue ? (
          <div style={{ fontSize: 38, color: MUTED, marginTop: 20, display: 'flex' }}>📍 {item.venue}</div>
        ) : null}
        {item.teaser ? (
          <div style={{ fontSize: 34, color: MUTED, lineHeight: 1.45, marginTop: 22 }}>{item.teaser}</div>
        ) : null}
        {item.badges.length ? (
          <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
            {item.badges.map((b) => (
              <div
                key={b}
                style={{
                  display: 'flex',
                  border: `3px solid ${color}`,
                  color,
                  fontSize: 27,
                  fontWeight: 700,
                  borderRadius: 999,
                  padding: '10px 22px',
                }}
              >
                {b}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ height: 8, width: 64, background: color, borderRadius: 99, display: 'flex' }} />
        <div style={{ fontSize: 28, color: MUTED, display: 'flex' }}>okolo.events</div>
      </div>
    </Frame>
  );
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const channel = getChannel(searchParams.get('channel') || 'linz');
  if (!channel) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

  const slide = Number(searchParams.get('slide') || 0);
  const digest = await loadOrBuildDigest(channel);
  if (!digest.items.length) return NextResponse.json({ error: 'no events this weekend' }, { status: 404 });
  if (!Number.isInteger(slide) || slide < 0 || slide > digest.items.length) {
    return NextResponse.json({ error: 'slide out of range' }, { status: 400 });
  }

  return new ImageResponse(
    slide === 0 ? coverSlide(digest) : eventSlide(digest, digest.items[slide - 1], slide),
    { ...SIZE, fonts: await fonts() },
  );
}
