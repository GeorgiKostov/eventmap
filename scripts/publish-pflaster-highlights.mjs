#!/usr/bin/env node
// Generate and publish the verified Friday Pflasterspektakel highlights as an
// Okolo-owned carousel. Source facts: the festival's official Tagesprogramm
// for Friday, 24 July 2026. No source prose or imagery is reused.
//
// Safe default: generate assets and print the caption only.
//   node --env-file=.env.local scripts/publish-pflaster-highlights.mjs
//   node --env-file=.env.local scripts/publish-pflaster-highlights.mjs --publish --target both

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getChannel } from '../lib/city-channels.js';
import {
  missingSocialConfig,
  publishEditorialCarouselAndLedger,
} from '../lib/social-publish.js';
import { metaGet, metaSet, metaClaim, metaDelete, closeDb } from '../lib/db.js';

const DATE = '2026-07-24';
const SLUG = 'pflaster-highlights';
const ASSET_DIR = 'social/pflaster-2026-07-24';
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');
const OUT = path.join(process.cwd(), 'public', ...ASSET_DIR.split('/'));
const channel = getChannel('linz');
const args = process.argv.slice(2);
const publish = args.includes('--publish');
const force = args.includes('--force');
const targetArg = args[args.indexOf('--target') + 1] || 'both';
const targets = targetArg === 'both' ? ['instagram', 'facebook'] : [targetArg];

if (targets.some((target) => !['instagram', 'facebook'].includes(target))) {
  console.error('pass --target instagram|facebook|both');
  process.exit(1);
}

const slides = [
  {
    accent: '#C93A5B',
    cover: true,
    kicker: 'HEUTE IN LINZ',
    title: ['Pflaster-', 'spektakel'],
    subtitle: 'Unsere Highlights für Freitag',
    chips: ['Familie', 'Akrobatik', 'Samba', 'Feuer', 'Nightline'],
  },
  {
    accent: '#C93A5B',
    kicker: 'FAMILIEN-HIGHLIGHTS',
    title: ['Mit Kindern'],
    intro: 'Zwei starke Anker für einen entspannten Nachmittag.',
    blocks: [
      { time: '14–20', title: 'Kinderspektakel', detail: ['Donaupark + Schlossmuseum', 'Wasserspiel, Kreativstationen, Spiele'] },
      { time: '17–18', title: 'Kaleidoskopnachmittag', detail: ['LINZ AG Spektakelzelt', 'Sitzplatzkarte erforderlich'] },
      { time: 'LINE-UP', title: 'Vier Acts in einer Stunde', detail: ['Andy Spigola · Gipsy Marionettist', 'Umami Dancetheatre · Cia Palma'] },
    ],
  },
  {
    accent: '#3F7CA8',
    kicker: 'HOCH HINAUS',
    title: ['Luftakrobatik'],
    intro: 'Die besten Höhenflüge im heutigen Tagesprogramm.',
    blocks: [
      { time: '17 & 19', title: 'Avital & Jochen', detail: ['Domplatz'] },
      { time: '20:00', title: 'Cirque Barbette', detail: ['Lentos Freiraum'] },
      { time: '14 · 16 · 18', title: 'Duo Maria & Gloria', detail: ['Pfarrplatz'] },
    ],
  },
  {
    accent: '#7A5CC7',
    kicker: 'RHYTHMUS IN DER STADT',
    title: ['Samba & Energie'],
    intro: 'Wenn du nur einen Musikblock schaffst: nimm 21 Uhr.',
    blocks: [
      { time: '17:00', title: 'Brincadeira', detail: ['OK-Platz'] },
      { time: '19:00', title: 'Doppelpack', detail: ['Brincadeira · Herbert-Bayer-Platz', 'Barbarossa · Adalbert-Stifter-Platz'] },
      { time: '21:00', title: 'Unser Musik-Tipp', detail: ['Brincadeira · Lentos Freiraum', 'Barbarossa · OK-Platz'] },
    ],
  },
  {
    accent: '#D05738',
    kicker: 'NACH SONNENUNTERGANG',
    title: ['Feuerfinale'],
    intro: 'Feuer, Pyrotechnik und LED-Shows von 20 bis 23 Uhr.',
    blocks: [
      { time: '20:00 · 21:30', title: 'ZAP Circus', detail: ['Altes Rathaus'] },
      { time: '20:05 · 21:35', title: 'All In Circus', detail: ['Brunnen am Hauptplatz'] },
      { time: '22:30', title: 'Drums on Fire', detail: ['Pfarrplatz · unser Finale-Tipp'] },
    ],
  },
  {
    accent: '#57477D',
    kicker: 'WEITER BIS 01 UHR',
    title: ['Nightline'],
    intro: 'Live-Musik in zwei Innenstadt-Lokalen.',
    blocks: [
      { time: 'N1', title: 'Stadtwerkstatt', detail: ['23:00 Sound Gurus', '00:00 Faela'] },
      { time: 'N2', title: 'Kulturcafé Smaragd', detail: ['23:00 Banda Yala', '00:00 Chinquapin'] },
    ],
  },
  {
    accent: '#D97A2E',
    kicker: 'EINFACH LOSGEHEN',
    title: ['Unsere Route'],
    intro: 'Ein familienfreundlicher roter Faden durch den Festivaltag.',
    blocks: [
      { time: '14:00', title: 'Kinderspektakel', detail: ['Donaupark oder Schlossmuseum'] },
      { time: '17:00', title: 'Kaleidoskop', detail: ['Spektakelzelt'] },
      { time: '19:00', title: 'Umami Dancetheatre', detail: ['Dreifaltigkeitssäule'] },
      { time: '20:00+', title: 'Feuershows', detail: ['Hauptplatz oder Pfarrplatz'] },
    ],
  },
];

const caption = `🎪 Pflasterspektakel heute in Linz – unsere Highlights:

👨‍👩‍👧‍👦 14–20 Uhr Kinderspektakel im Donaupark und beim Schlossmuseum
🎭 17 Uhr Kaleidoskopnachmittag für Groß und Klein
🤸 17 & 19 Uhr Avital & Jochen am Domplatz
🥁 21 Uhr Brincadeira beim Lentos oder Barbarossa am OK-Platz
🔥 20–23 Uhr Feuershows – unser Finale-Tipp: Drums on Fire um 22:30 am Pfarrplatz
🌙 Ab 23 Uhr Nightline in Stadtwerkstatt und Smaragd

Alle 37 Spielorte und Zeiten findest du auf okolo.events.

Die Künstler*innen spielen für Hutgeld – Kleingeld einpacken 💛
Programmstand: Freitag, 24. Juli, Mittag. Kurzfristige Änderungen möglich.

#linz #pflasterspektakel #linzmitkindern #wasistlosinlinz #oberösterreich #okolo`;

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function lines(items, x, y, { size, weight = 400, color = '#212B28', gap = size * 1.25, anchor = 'start' }) {
  return `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">`
    + items.map((line, i) => `<tspan x="${x}" dy="${i ? gap : 0}">${esc(line)}</tspan>`).join('')
    + '</text>';
}

function logo(color = '#212B28') {
  return `<g transform="translate(72 62)">
    <path fill="${color}" fill-rule="evenodd" d="M19 0C8.5 0 0 8.5 0 19c0 14.3 19 35.4 19 35.4S38 33.3 38 19C38 8.5 29.5 0 19 0zm0 25.8a6.8 6.8 0 1 1 0-13.6 6.8 6.8 0 0 1 0 13.6z"/>
    <text x="54" y="35" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="${color}">okolo.linz</text>
  </g>`;
}

function slideSvg(slide, index) {
  if (slide.cover) {
    const chips = slide.chips.map((chip, i) => {
      const widths = [146, 190, 132, 124, 180];
      const x = 72 + widths.slice(0, i).reduce((a, b) => a + b + 14, 0);
      return `<rect x="${x}" y="930" width="${widths[i]}" height="62" rx="31" fill="#fff" fill-opacity=".18"/>
        <text x="${x + widths[i] / 2}" y="971" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#fff" text-anchor="middle">${esc(chip)}</text>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
      <rect width="1080" height="1350" fill="${slide.accent}"/>
      <circle cx="1010" cy="115" r="330" fill="#fff" fill-opacity=".07"/>
      <circle cx="1040" cy="1180" r="420" fill="#212B28" fill-opacity=".08"/>
      ${logo('#fff')}
      ${lines([slide.kicker], 72, 250, { size: 34, weight: 700, color: '#fff' })}
      ${lines(slide.title, 72, 405, { size: 126, weight: 700, color: '#fff', gap: 126 })}
      ${lines([slide.subtitle], 72, 760, { size: 48, weight: 700, color: '#fff' })}
      ${lines(['Freitag · 24. Juli · Linzer Innenstadt'], 72, 835, { size: 32, color: '#fff' })}
      ${chips}
      ${lines(['Wischen für den Plan →'], 72, 1195, { size: 37, weight: 700, color: '#fff' })}
      ${lines(['okolo.events'], 72, 1262, { size: 29, color: '#fff' })}
      ${lines([`${index + 1} / ${slides.length}`], 1008, 1262, { size: 29, weight: 700, color: '#fff', anchor: 'end' })}
    </svg>`;
  }

  const blockHeight = slide.blocks.length === 4 ? 158 : 188;
  const startY = slide.blocks.length === 4 ? 520 : 535;
  const blocks = slide.blocks.map((block, i) => {
    const y = startY + i * (blockHeight + 18);
    return `<rect x="72" y="${y}" width="936" height="${blockHeight}" rx="26" fill="#fff"/>
      <rect x="72" y="${y}" width="180" height="${blockHeight}" rx="26" fill="${slide.accent}"/>
      ${lines([block.time], 162, y + blockHeight / 2 + 11, { size: block.time.length > 10 ? 24 : 29, weight: 700, color: '#fff', anchor: 'middle' })}
      ${lines([block.title], 286, y + 58, { size: 38, weight: 700 })}
      ${lines(block.detail, 286, y + 105, { size: 27, color: '#6D7876', gap: 37 })}`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="#F2F2EE"/>
    <rect width="1080" height="212" fill="${slide.accent}"/>
    ${logo('#fff')}
    ${lines([slide.kicker], 72, 298, { size: 30, weight: 700, color: slide.accent })}
    ${lines(slide.title, 72, 395, { size: 78, weight: 700, gap: 82 })}
    ${lines([slide.intro], 72, 468, { size: 30, color: '#6D7876' })}
    ${blocks}
    ${lines(['okolo.events · @okolo.linz'], 72, 1284, { size: 28, color: '#6D7876' })}
    ${lines([`${index + 1} / ${slides.length}`], 1008, 1284, { size: 28, weight: 700, color: slide.accent, anchor: 'end' })}
  </svg>`;
}

await mkdir(OUT, { recursive: true });
for (const [index, slide] of slides.entries()) {
  const file = path.join(OUT, `slide-${String(index + 1).padStart(2, '0')}.png`);
  await sharp(Buffer.from(slideSvg(slide, index))).png().toFile(file);
  console.log(`generated ${path.relative(process.cwd(), file)}`);
}

const imageUrls = slides.map((_, i) => `${BASE}/${ASSET_DIR}/slide-${String(i + 1).padStart(2, '0')}.png`);
console.log(`\ncaption (${caption.length} chars):\n${caption}\n`);
console.log(`images (${imageUrls.length}):\n${imageUrls.join('\n')}`);

if (!publish) {
  console.log('\n(dry run — generation only; pass --publish after the public URLs are deployed and verified)');
  await closeDb();
  process.exit(0);
}

for (const target of targets) {
  const missing = missingSocialConfig(target, channel);
  if (missing.length) throw new Error(`${target} not configured: ${missing.join(', ')}`);
}

for (const url of imageUrls) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/png')) {
    throw new Error(`public carousel asset is not ready: ${url} → ${res.status} ${res.headers.get('content-type')}`);
  }
  const bytes = Number(res.headers.get('content-length') || 0);
  console.log(`verified public asset: ${url} (${bytes || 'unknown'} bytes)`);
}

for (const target of targets) {
  const record = await publishEditorialCarouselAndLedger({
    channel, slug: SLUG, date: DATE, imageUrls, caption, target, force,
    metaGet, metaSet, metaClaim, metaDelete,
  });
  console.log(`posted ${target}: id=${record.id} permalink=${record.permalink || '(none)'}`);
}

await closeDb();
