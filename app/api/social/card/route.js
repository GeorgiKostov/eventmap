import { ImageResponse } from 'next/og';
import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { getChannel, brandName } from '../../../../lib/city-channels.js';
import { loadDigest, loadDigestFor } from '../../../../lib/digest.js';
import { CATS, P } from '../../../../lib/icons.js';

// Weekly social carousel: one 1080×1350 (Instagram portrait) PNG per slide,
// rendered from OUR data with OUR template. Slide 0 is the cover, slides 1..N
// are the picks. Never a source's poster or prose — the art is ours and the
// facts are ours (hard rule 1).
//
// Layout grammar (design-system.md): each event card is a bold CATEGORY-COLOUR
// header carrying the date + a large translucent category glyph, over a paper
// panel with the facts. The colour block is what makes the card readable at
// thumbnail size in a feed — the previous all-paper layout had no anchor and
// half the canvas was empty. Category colour is read from CATS, the single
// source (never a hex literal).
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
const MUTED = '#6D7876';
const PAPER = '#F2F2EE';
const PANEL = '#FFFFFF';

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

const COPY = {
  de: { kicker: 'Familien-Wochenende', cta: 'Alle Infos & Karte', swipe: 'Weiterwischen →', ideas: (n) => `${n} Ideen` },
  bg: { kicker: 'Семеен уикенд', cta: 'Всичко на картата', swipe: 'Плъзни →', ideas: (n) => `${n} идеи` },
  en: { kicker: 'Family weekend', cta: 'Everything on the map', swipe: 'Swipe →', ideas: (n) => `${n} picks` },
};

// The category glyph, oversized and translucent, as the header's texture.
function CatGlyph({ cat, size, opacity }) {
  const paths = P[cat] || P.family;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity }}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// The wordmark carries the CITY handle (okolo.linz) — a single reshared slide
// should travel with the handle the viewer can actually follow, and it matches
// the newsletter header (one brand moment across surfaces).
function Wordmark({ color = INK, mark = ACCENT, text = 'okolo' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg width="38" height="38" viewBox="0 0 24 24">
        <path
          fill={mark}
          fillRule="evenodd"
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
        />
      </svg>
      <div style={{ fontSize: 36, fontWeight: 700, color, letterSpacing: -1 }}>{text}</div>
    </div>
  );
}

// ---- cover ----
function coverSlide(digest) {
  const c = COPY[digest.channel.lang] || COPY.en;
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, fontFamily: 'Noto Sans' }}>
      {/* brand block */}
      <div style={{ display: 'flex', flexDirection: 'column', background: ACCENT, padding: '64px 72px 56px' }}>
        <Wordmark color="#fff" mark="#fff" text={digest.channel.handle} />
        <div style={{ fontSize: 38, fontWeight: 700, color: '#fff', opacity: 0.85, marginTop: 44, letterSpacing: 1 }}>
          {c.kicker}
        </div>
        <div style={{ fontSize: 104, fontWeight: 700, color: '#fff', letterSpacing: -3, lineHeight: 1.05, marginTop: 6 }}>
          {brandName(digest.channel)}
        </div>
        <div style={{ fontSize: 46, color: '#fff', opacity: 0.9, marginTop: 14 }}>{digest.label}</div>
      </div>

      {/* what's inside — the cover earns the swipe by showing the list */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '48px 72px 0', flexGrow: 1, justifyContent: 'center' }}>
        {digest.items.slice(0, 5).map((it, i) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 26 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 54,
                height: 54,
                borderRadius: 999,
                background: CATS[it.cat]?.color || ACCENT,
                color: '#fff',
                fontSize: 28,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            {/* Wrap to two lines rather than clipping: a truncated title on the
                COVER is the one place truncation costs us the click — that line is
                the whole pitch for swiping to the card. */}
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                fontWeight: 700,
                color: INK,
                lineHeight: 1.28,
                maxWidth: 840,
                overflow: 'hidden',
                // satori honours -webkit-line-clamp; two lines is the ceiling
                // before five picks stop fitting the panel.
                WebkitLineClamp: 2,
              }}
            >
              {it.title}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 72px 56px' }}>
        <div style={{ display: 'flex', fontSize: 30, color: MUTED }}>{c.cta} · okolo.events</div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: ACCENT }}>{c.swipe}</div>
      </div>
    </div>
  );
}

// ---- one event ----
function eventSlide(digest, item, n) {
  const c = COPY[digest.channel.lang] || COPY.en;
  const color = CATS[item.cat]?.color || ACCENT;
  const big = item.title.length > 60;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: PAPER, fontFamily: 'Noto Sans' }}>
      {/* category header: colour + date + oversized glyph */}
      <div style={{ display: 'flex', flexDirection: 'column', background: color, padding: '56px 72px 52px', position: 'relative' }}>
        <div style={{ display: 'flex', position: 'absolute', top: -40, right: -50 }}>
          <CatGlyph cat={item.cat} size={380} opacity={0.16} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark color="#fff" mark="#fff" text={digest.channel.handle} />
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#fff', opacity: 0.85 }}>
            {n} / {digest.items.length}
          </div>
        </div>
        <div style={{ fontSize: 58, fontWeight: 700, color: '#fff', marginTop: 40, letterSpacing: -1 }}>{item.when}</div>
      </div>

      {/* facts — vertically centred in the panel, footer pinned to the floor */}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, background: PANEL, padding: '56px 72px' }}>
       <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
        <div
          style={{
            fontSize: big ? 60 : 74,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.14,
            letterSpacing: -1.5,
          }}
        >
          {item.title}
        </div>

        {item.venue ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 26 }}>
            <svg width="34" height="34" viewBox="0 0 24 24">
              <path
                fill={color}
                fillRule="evenodd"
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
              />
            </svg>
            <div style={{ display: 'flex', fontSize: 36, color: MUTED }}>{item.venue}</div>
          </div>
        ) : null}

        {item.teaser ? (
          <div style={{ fontSize: 34, color: MUTED, lineHeight: 1.5, marginTop: 24 }}>{item.teaser}</div>
        ) : null}

        {item.badges.length ? (
          <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
            {item.badges.map((b) => (
              <div
                key={b}
                style={{
                  display: 'flex',
                  background: color,
                  color: '#fff',
                  fontSize: 26,
                  fontWeight: 700,
                  borderRadius: 999,
                  padding: '12px 24px',
                }}
              >
                {b}
              </div>
            ))}
          </div>
        ) : null}

       </div>

        {/* footer sticks to the bottom of the panel */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 28, color: MUTED }}>okolo.events</div>
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color }}>
            {n === digest.items.length ? c.cta + ' →' : c.swipe}
          </div>
        </div>
      </div>
    </div>
  );
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const channel = getChannel(searchParams.get('channel') || 'linz');
  if (!channel) return NextResponse.json({ error: 'unknown channel' }, { status: 400 });

  // Read the frozen snapshot ONLY — never build here. This route is public
  // (cards are embedded in social posts), and loadOrBuild would let an anonymous
  // hit freeze a stale pick set for the whole weekend AND trigger a paid AI copy
  // call. Building the snapshot is the authenticated desk's job.
  // `weekend=<friday>` pins the card to one specific weekend — the public weekend
  // page uses it as its OG image, so an OLD page keeps unfurling with ITS OWN
  // cover instead of silently showing whatever is current.
  const pinned = searchParams.get('weekend');
  const digest = pinned ? await loadDigestFor(channel, pinned) : await loadDigest(channel);
  if (!digest) return NextResponse.json({ error: 'digest not prepared yet' }, { status: 404 });
  if (!digest.items.length) return NextResponse.json({ error: 'no events this weekend' }, { status: 404 });

  // Address a card by EVENT ID (`event=`, used by individual posts — immune to a
  // Regenerate reordering the slides) or by SLIDE index (`slide=`, cover=0, used
  // by the carousel). event= wins; a stale id 404s rather than render the wrong
  // event's card.
  const eventId = searchParams.get('event');
  let slide;
  if (eventId != null) {
    const idx = digest.items.findIndex((it) => String(it.id) === String(eventId));
    if (idx === -1) return NextResponse.json({ error: 'event not in this weekend' }, { status: 404 });
    slide = idx + 1;
  } else {
    slide = Number(searchParams.get('slide') || 0);
    if (!Number.isInteger(slide) || slide < 0 || slide > digest.items.length) {
      return NextResponse.json({ error: 'slide out of range' }, { status: 400 });
    }
  }

  return new ImageResponse(
    slide === 0 ? coverSlide(digest) : eventSlide(digest, digest.items[slide - 1], slide),
    { ...SIZE, fonts: await fonts() },
  );
}
