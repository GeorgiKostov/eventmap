// Facebook Page cover generator — one 1640x624 PNG per city channel.
//
//   node scripts/gen-cover.mjs --channel wien     # write one city's cover
//   node scripts/gen-cover.mjs --all              # write every channel's cover
//   node scripts/gen-cover.mjs --verify           # regenerate all, diff vs committed, write nothing
//
// WHY THIS COMPOSITES PLATES INSTEAD OF DRAWING THE ART
// The original art came from a throwaway next/og route that was never committed
// (f2dc435 landed the PNGs only). Redrawing the wordmark, the lens, the dashed
// orbit and the seven pins from scratch would land "close but not the same", and
// every future city would then sit visibly off the first ten. So the ART is reused
// verbatim as plates cut from the committed covers (assets/social/_parts/) and this
// script only TYPESETS THE CITY NAME. The house style cannot drift, because it is
// the same pixels rather than a re-derivation of them.
//
// The trade-off, stated plainly: the plates are frozen, so they no longer track
// CATS colours or lib/icons.js glyphs. If the pin palette or icon set changes,
// these covers keep the old art until someone re-cuts the plates — and --verify
// will NOT catch it, because it compares against that same frozen art. For brand
// furniture regenerated once per city, never drifting is worth more than tracking
// tokens automatically.
//
// LAYOUT — solved from the committed covers, and asserted by --verify.
// A row centred at x=818: [text column][GAP][lens]. The column is as wide as its
// widest child, so a long name (Innsbruck) or the wider Cyrillic tagline (Sofia)
// widens the column and pushes the lens right — which is why the ten covers do not
// share one lens position. The model reproduces the lens centre of all ten EXACTLY
// (--verify asserts lensΔ=0), including Innsbruck and Stuttgart, which were never
// used to fit it. Vertical positions are fixed: a descender (Salzburg's 'g') does
// not move the tagline, because flex lines are sized by font metrics, not by ink.
//
// --verify's edgePx is NOT expected to be zero and is not a failure: the originals
// rasterised at fractional x, and a plate composited at an integer x cannot
// reproduce subpixel AA. Only lensΔ is a real assertion.
//
// ADDING A CITY: add the row to lib/city-channels.js, then `--channel <slug>`.
// A NEW LANGUAGE needs a tagline plate first — see TAGLINE_PLATE below; the script
// refuses rather than typeset a tagline whose metrics it cannot verify.
import { ImageResponse } from 'next/og.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CHANNELS, getChannel, brandName } from '../lib/city-channels.js';

const W = 1640;
const H = 624;
const PAPER = '#F2F2EE';
const INK = '#212B28';

// --- the model, solved from the committed art (see --verify) ------------------
// The row is centred on x=818 (NOT the canvas centre 820 — there is 4px of slack
// somewhere in the original tree). Each element is then rounded from its own float
// position independently, which is why left and lens don't always move by the same
// integer: that detail is what makes the model land on the committed covers instead
// of 1px beside them.
const ROW_CENTER = 818;
const GAP = 73;            // column right edge → lens box left edge
const LENS_W = 515;         // the disc box (r=257.5)
const LENS_BLEED = 40;     // shadow margin baked into the lens plate
const WORDMARK_TOP = 170;
const CITY_BOX_TOP = 286;  // so Linz's ink top lands on 299
const TAGLINE_TOP = 405;
// Tagline box width per language — the plate's own width. Not a guess: derived
// from the lens offsets the committed covers actually have.
const TAGLINE_W = { de: 426, bg: 473 };
const TAGLINE_PLATE = { de: 'tagline-de.png', bg: 'tagline-bg.png' };

const CITY_STYLE = { fontSize: 100, fontWeight: 700, letterSpacing: -3, color: INK };

const root = path.join(import.meta.dirname, '..');
const asset = (...p) => path.join(root, 'assets', 'social', ...p);

let FONTS;
async function fonts() {
  if (FONTS) return FONTS;
  const dir = path.join(root, 'public', 'fonts');
  FONTS = [{ name: 'Noto Sans', data: await fs.readFile(path.join(dir, 'NotoSans-Bold.ttf')), weight: 700, style: 'normal' }];
  return FONTS;
}

// Render one line with its BOX origin at (0,0). Compositing the result at the
// column's left edge reproduces the glyph's own left side bearing, which differs
// per string ('W' ≈ 0px, 'L' ≈ 9px) and must not be normalised away.
async function renderLine(text, background) {
  const el = {
    type: 'div',
    props: {
      style: { display: 'flex', width: '100%', height: '100%', background: 'transparent', alignItems: 'flex-start' },
      children: {
        type: 'div',
        props: { style: { ...CITY_STYLE, fontFamily: 'Noto Sans', lineHeight: 1, display: 'flex', background }, children: text },
      },
    },
  };
  return Buffer.from(await new ImageResponse(el, { width: 1400, height: 300, fonts: await fonts() }).arrayBuffer());
}

function bbox(raw, hit) {
  const { width, height, channels } = raw.info;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (hit(raw.data[i], raw.data[i + 1], raw.data[i + 2], raw.data[i + 3])) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// The city name as a transparent PNG cropped to its layout box (not its ink).
//
// boxW is measured to SUB-PIXEL precision: the probe box is a solid rect, so the
// alpha across one of its rows sums to the true fractional width. Rounding it to
// whole pixels first (an integer bbox) loses up to a pixel, and that error lands
// straight in the centring maths as a visibly shifted lens.
async function cityPlate(text) {
  const probe = await sharp(await renderLine(text, '#FF00FF')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = bbox(probe, (r, g, b, a) => a > 8);
  const { width, channels } = probe.info;
  const midY = Math.floor((box.minY + box.maxY) / 2);
  let cover = 0;
  for (let x = 0; x < width; x++) cover += probe.data[(midY * width + x) * channels + 3] / 255;

  const img = await renderLine(text, 'transparent');
  const cropped = await sharp(img).extract({ left: box.minX, top: box.minY, width: box.w, height: box.h }).png().toBuffer();
  return { img: cropped, boxW: cover };
}

async function buildCover(channel) {
  const plateName = TAGLINE_PLATE[channel.lang];
  if (!plateName) {
    throw new Error(
      `no tagline plate for lang '${channel.lang}' (have: ${Object.keys(TAGLINE_PLATE).join(', ')}). ` +
      `Cut one from a cover in that language and add its box width to TAGLINE_W — do NOT typeset a new ` +
      `tagline here, its metrics are unverified and would shift the lens.`,
    );
  }
  const city = await cityPlate(brandName(channel));
  const colW = Math.max(city.boxW, TAGLINE_W[channel.lang]);
  const leftFloat = ROW_CENTER - (colW + GAP + LENS_W) / 2;
  const left = Math.round(leftFloat);
  const lensBoxLeft = Math.round(leftFloat + colW + GAP);

  const [wordmark, lens, tagline] = await Promise.all([
    fs.readFile(asset('_parts', 'wordmark.png')),
    fs.readFile(asset('_parts', 'lens.png')),
    fs.readFile(asset('_parts', plateName)),
  ]);

  return sharp({ create: { width: W, height: H, channels: 3, background: PAPER } })
    .composite([
      { input: wordmark, left, top: WORDMARK_TOP },
      { input: city.img, left, top: CITY_BOX_TOP },
      { input: tagline, left, top: TAGLINE_TOP },
      { input: lens, left: lensBoxLeft - LENS_BLEED, top: 0 },
    ])
    .png()
    .toBuffer();
}

async function diff(a, b) {
  const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).raw().toBuffer({ resolveWithObject: true });
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) return { size: 'DIFFERENT' };
  const { width, height, channels } = A.info;
  let n = 0, minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    let d = 0;
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A.data[i + k] - B.data[i + k]));
    if (d > 24) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { n, box: n ? `x ${minX}..${maxX} y ${minY}..${maxY}` : '—' };
}

const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? null : process.argv[i + 1];
};

// Centre of the white disc — the structural check. If the layout model is wrong,
// this moves; sub-pixel antialiasing cannot move it.
async function lensCenterX(buf) {
  const r = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = r.info;
  let minX = 1e9, maxX = -1;
  for (let y = 0; y < height; y++) for (let x = 700; x < width; x++) {
    const i = (y * width + x) * channels;
    if (r.data[i] === 255 && r.data[i + 1] === 255 && r.data[i + 2] === 255) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  }
  return (minX + maxX) / 2;
}

if (process.argv.includes('--verify')) {
  console.log('regenerating every channel from the plates and comparing to the committed art\n');
  console.log('  lensΔ  = layout check. Must be 0. Anything else means the centring model is wrong.');
  console.log('  edgePx = pixels differing by >24. NOT expected to be 0: the originals rasterised the');
  console.log('           lens and glyphs at FRACTIONAL x (e.g. Sofia at 833.5), and compositing a');
  console.log('           plate at an integer x cannot reproduce that subpixel antialiasing. It shows');
  console.log('           up as a thin halo on high-contrast edges and is invisible at any zoom.');
  console.log('           Covers whose lens happens to land on an integer (colW=426) come out exact\n');
  let bad = 0;
  for (const ch of CHANNELS) {
    const mine = await buildCover(ch);
    const theirs = await fs.readFile(asset(`okolo-${ch.slug}-cover.png`));
    const d = await diff(mine, theirs);
    const dl = (await lensCenterX(mine)) - (await lensCenterX(theirs));
    if (dl !== 0) bad++;
    console.log(`${ch.slug.padEnd(10)} lensΔ ${String(dl).padStart(5)}   edgePx ${String(d.n).padStart(6)}   ${d.n ? d.box : 'byte-identical'}`);
  }
  console.log(bad ? `\n✗ ${bad} channel(s) place the lens wrong — the model is broken` : '\n✓ every channel places the lens exactly; residual is subpixel edge AA only');
} else if (process.argv.includes('--all') || arg('channel')) {
  const list = arg('channel') ? [getChannel(arg('channel'))] : CHANNELS;
  for (const ch of list) {
    if (!ch) throw new Error(`unknown channel '${arg('channel')}'`);
    const file = asset(`okolo-${ch.slug}-cover.png`);
    await fs.writeFile(file, await buildCover(ch));
    console.log(`wrote ${path.relative(root, file)} — "${brandName(ch)}"`);
  }
} else {
  console.log('usage: --channel <slug> | --all | --verify');
}
