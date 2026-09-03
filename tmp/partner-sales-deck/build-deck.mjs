import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const ROOT = '/Users/georgikostov/Repositories/eventmap';
const OUT = `${ROOT}/output/presentations`;
const PREVIEW = `${OUT}/partner-deck-preview`;
const FINAL = `${OUT}/okolo-festival-partner-map.pptx`;

const DESKTOP = `${ROOT}/output/screenshots/partner-demo/01-public-partner-demo-desktop.png`;
const DESKTOP_OVERVIEW = `${ROOT}/output/screenshots/partner-demo/03-public-partner-demo-desktop-overview.png`;
const MOBILE = `${ROOT}/output/screenshots/partner-demo/02-public-partner-demo-mobile.png`;
const AEC_MAP = `${ROOT}/output/screenshots/partner-showcase/01-aec-partner-map-desktop.jpg`;
const AEC_DETAIL = `${ROOT}/output/screenshots/partner-showcase/02-aec-partner-event-detail-desktop.jpg`;
const SAMPLE_MARK = `${ROOT}/public/partner-demo/sample-festival-mark.svg`;
let ASSETS;

const C = {
  canvas: '#FFFFFF',
  ink: '#212B28',
  muted: '#6D7876',
  panel: '#F2F2EE',
  line: '#DADCD5',
  accent: '#C93A5B',
  accentSoft: '#FBEEF1',
  gold: '#F7C451',
};

const FONT = 'Helvetica Neue';

function box(slide, name, position, fill = C.canvas, line = C.line, radius = 16) {
  return slide.shapes.add({
    geometry: 'roundRect',
    name,
    position,
    fill,
    line: { style: 'solid', fill: line, width: 1 },
    borderRadius: radius,
  });
}

function text(slide, name, value, position, options = {}) {
  const shape = slide.shapes.add({
    geometry: 'textbox',
    name,
    position,
    fill: 'none',
    line: { style: 'solid', fill: 'none', width: 0 },
  });
  shape.text = value;
  shape.text.style = {
    fontSize: options.fontSize || 20,
    typeface: FONT,
    bold: !!options.bold,
    color: options.color || C.ink,
    alignment: options.alignment || 'left',
    verticalAlignment: options.verticalAlignment || 'top',
  };
  return shape;
}

function rule(slide, name, left, top, width, color = C.line, weight = 1) {
  return slide.shapes.add({
    geometry: 'line',
    name,
    position: { left, top, width, height: 0 },
    fill: 'none',
    line: { style: 'solid', fill: color, width: weight },
  });
}

function image(slide, name, path, position, alt, fit = 'contain', radius = 14) {
  box(slide, `${name}-backing`, position, C.panel, C.line, radius);
  const asset = ASSETS.get(path);
  if (!asset) throw new Error(`Missing embedded asset: ${path}`);
  return slide.images.add({
    blob: asset.bytes,
    contentType: asset.contentType,
    name,
    alt,
    fit,
    geometry: 'roundRect',
    borderRadius: radius,
    position,
  });
}

function footer(slide, number, label = 'OKOLO · FESTIVAL PARTNERS') {
  text(slide, `footer-label-${number}`, label, { left: 54, top: 676, width: 430, height: 20 }, { fontSize: 11, bold: true, color: C.muted });
  text(slide, `footer-page-${number}`, String(number), { left: 1180, top: 676, width: 45, height: 20 }, { fontSize: 11, bold: true, color: C.muted, alignment: 'right' });
}

function notes(slide, lines) {
  slide.speakerNotes.textFrame.setText(`[Sources]\n${lines.map((line) => `- ${line}`).join('\n')}`);
}

function addTitle(slide, number, titleValue, eyebrow = 'OKOLO FOR FESTIVAL PARTNERS') {
  text(slide, `eyebrow-${number}`, eyebrow, { left: 54, top: 36, width: 500, height: 24 }, { fontSize: 14, bold: true, color: C.accent });
  text(slide, `title-${number}`, titleValue, { left: 54, top: 70, width: 1168, height: 92 }, { fontSize: 42, bold: true });
}

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

async function main() {
  await fs.mkdir(PREVIEW, { recursive: true });
  ASSETS = new Map(await Promise.all([
    [DESKTOP, 'image/png'],
    [DESKTOP_OVERVIEW, 'image/png'],
    [MOBILE, 'image/png'],
    [AEC_MAP, 'image/jpeg'],
    [AEC_DETAIL, 'image/jpeg'],
    [SAMPLE_MARK, 'image/svg+xml'],
  ].map(async ([path, contentType]) => [path, { bytes: new Uint8Array(await fs.readFile(path)), contentType }])));
  const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

  // 1 — cover, based on Codex Grid's split-image cover composition.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    text(slide, 'cover-eyebrow', 'OKOLO FOR FESTIVAL PARTNERS', { left: 54, top: 44, width: 470, height: 28 }, { fontSize: 15, bold: true, color: C.accent });
    text(slide, 'cover-title', 'Put your whole festival\non one map', { left: 54, top: 126, width: 500, height: 248 }, { fontSize: 56, bold: true });
    text(slide, 'cover-subtitle', 'A dedicated Okolo map connects every venue, time and approved programme link.', { left: 54, top: 414, width: 500, height: 104 }, { fontSize: 24, color: C.muted });
    text(slide, 'cover-url', 'okolo.events/partners/demo', { left: 54, top: 570, width: 450, height: 34 }, { fontSize: 19, bold: true, color: C.accent });
    image(slide, 'cover-product', DESKTOP_OVERVIEW, { left: 606, top: 42, width: 620, height: 610 }, 'Fictional public Okolo festival partner-map overview on desktop', 'cover', 18);
    footer(slide, 1);
    notes(slide, [DESKTOP_OVERVIEW]);
  }

  // 2 — problem framing, deliberately flat rather than a card grid.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    addTitle(slide, 2, 'A timetable lists events. A map helps visitors decide.');
    const items = [
      ['01', 'Where is it?', 'Every venue becomes visible in relation to the rest of the festival.'],
      ['02', 'When should I go?', 'Day and programme filters reduce a long timetable to the next useful choice.'],
      ['03', 'What happens next?', 'Each event carries the visitor to the organizer-approved source.'],
    ];
    items.forEach(([n, heading, body], index) => {
      const top = 220 + index * 126;
      text(slide, `problem-number-${index}`, n, { left: 54, top, width: 80, height: 45 }, { fontSize: 33, bold: true, color: C.accent });
      text(slide, `problem-title-${index}`, heading, { left: 158, top, width: 300, height: 44 }, { fontSize: 28, bold: true });
      text(slide, `problem-body-${index}`, body, { left: 486, top: top + 2, width: 690, height: 66 }, { fontSize: 21, color: C.muted });
      if (index < 2) rule(slide, `problem-rule-${index}`, 54, top + 88, 1122);
    });
    footer(slide, 2);
    notes(slide, [`${ROOT}/docs/design/design-doc.md`]);
  }

  // 3 — product evidence.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    addTitle(slide, 3, 'A dedicated URL becomes the festival’s front door');
    image(slide, 'desktop-demo', DESKTOP, { left: 54, top: 170, width: 900, height: 506 }, 'Desktop public partner demo with branded festival map, filters and event detail', 'contain', 16);
    text(slide, 'demo-label', 'PUBLIC DEMO', { left: 994, top: 196, width: 220, height: 28 }, { fontSize: 14, bold: true, color: C.accent });
    text(slide, 'demo-url', 'okolo.events/\npartners/demo', { left: 994, top: 238, width: 220, height: 80 }, { fontSize: 27, bold: true });
    text(slide, 'demo-copy', 'Fictional programme\nOriginal sample identity\nNo production event records', { left: 994, top: 364, width: 230, height: 128 }, { fontSize: 19, color: C.muted });
    text(slide, 'demo-invite', 'Open it. Filter it. Tap any pin.', { left: 994, top: 560, width: 220, height: 62 }, { fontSize: 21, bold: true, color: C.accent });
    footer(slide, 3);
    notes(slide, [DESKTOP, `${ROOT}/app/partners/demo/page.js`]);
  }

  // 4 — mobile continuation, split-image silhouette.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    addTitle(slide, 4, 'The festival identity stays visible from map to detail');
    image(slide, 'mobile-demo', MOBILE, { left: 90, top: 168, width: 330, height: 500 }, 'Mobile partner demo with branded festival header and selected event detail', 'contain', 18);
    const lines = [
      ['Brand first', 'The organizer lockup remains above the map.'],
      ['Context preserved', 'Day, time, venue and programme label travel into event detail.'],
      ['One next action', 'Visitors continue to the approved programme or ticket source.'],
    ];
    lines.forEach(([heading, body], index) => {
      const top = 216 + index * 132;
      text(slide, `mobile-heading-${index}`, heading, { left: 520, top, width: 610, height: 42 }, { fontSize: 29, bold: true });
      text(slide, `mobile-body-${index}`, body, { left: 520, top: top + 48, width: 620, height: 60 }, { fontSize: 21, color: C.muted });
    });
    footer(slide, 4);
    notes(slide, [MOBILE]);
  }

  // 5 — four-point partner package, based on Codex Grid's four-point layout.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    addTitle(slide, 5, 'The partner layer adds value without taking over the map');
    const points = [
      ['Dedicated URL', 'A shareable festival destination on Okolo.'],
      ['Approved identity', 'Logo slot, name and edition across map and event surfaces.'],
      ['Programme lens', 'Partner-only and day filters make a large programme manageable.'],
      ['Source continuity', 'Facts stay concise; every event links back to the approved source.'],
    ];
    points.forEach(([heading, body], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const left = 54 + col * 596;
      const top = 206 + row * 212;
      rule(slide, `package-rule-${index}`, left, top, 540, index === 0 ? C.accent : C.line, index === 0 ? 4 : 1);
      text(slide, `package-title-${index}`, heading, { left, top: top + 24, width: 500, height: 44 }, { fontSize: 29, bold: true });
      text(slide, `package-body-${index}`, body, { left, top: top + 82, width: 500, height: 80 }, { fontSize: 21, color: C.muted });
    });
    footer(slide, 5);
    notes(slide, [`${ROOT}/docs/decisions/2026-08-29-partner-festival-maps.md`]);
  }

  // 6 — private organizer-specific concept, clearly rights-bounded.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    addTitle(slide, 6, 'We can prototype an organizer-specific map before launch', 'PRIVATE CONCEPT EXAMPLE');
    image(slide, 'aec-map', AEC_MAP, { left: 54, top: 174, width: 560, height: 315 }, 'Private uncommissioned Ars Electronica map concept', 'contain', 14);
    image(slide, 'aec-detail', AEC_DETAIL, { left: 650, top: 174, width: 560, height: 315 }, 'Private uncommissioned Ars Electronica event-detail concept', 'contain', 14);
    box(slide, 'aec-disclaimer-box', { left: 54, top: 526, width: 1156, height: 94 }, C.accentSoft, C.accent, 12);
    text(slide, 'aec-disclaimer', 'Uncommissioned concept · no affiliation or endorsement · real artwork and partner language require written approval.', { left: 76, top: 548, width: 1112, height: 48 }, { fontSize: 21, bold: true, color: C.accent, alignment: 'center', verticalAlignment: 'middle' });
    footer(slide, 6, 'PRIVATE SALES MATERIAL · DO NOT PUBLISH AS A PARTNERSHIP');
    notes(slide, [AEC_MAP, AEC_DETAIL, 'https://ars.electronica.art/negotiatinghumanity/en/download/', 'https://ars.electronica.art/about/en/impress/']);
  }

  // 7 — one simple interaction flow; connectors are placed before nodes.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    addTitle(slide, 7, 'Partners can see what visitors use—and where they continue');
    const xs = [54, 352, 650, 948];
    for (let index = 0; index < 3; index += 1) rule(slide, `flow-line-${index}`, xs[index] + 222, 342, 76, C.accent, 3);
    const steps = [
      ['Map view', 'The dedicated festival map is opened.'],
      ['Filter', 'Visitors choose the festival or a programme day.'],
      ['Event open', 'A pin or list item becomes an event detail.'],
      ['Source referral', 'The visitor continues to the official source.'],
    ];
    steps.forEach(([heading, body], index) => {
      box(slide, `flow-node-${index}`, { left: xs[index], top: 236, width: 222, height: 214 }, index === 3 ? C.accentSoft : C.panel, index === 3 ? C.accent : C.line, 16);
      text(slide, `flow-index-${index}`, `0${index + 1}`, { left: xs[index] + 20, top: 256, width: 64, height: 34 }, { fontSize: 18, bold: true, color: C.accent });
      text(slide, `flow-title-${index}`, heading, { left: xs[index] + 20, top: 306, width: 182, height: 52 }, { fontSize: 25, bold: true });
      text(slide, `flow-body-${index}`, body, { left: xs[index] + 20, top: 366, width: 182, height: 66 }, { fontSize: 17, color: C.muted });
    });
    text(slide, 'measurement-note', 'Measurement supports a partner report; it does not alter event facts or ranking rules.', { left: 54, top: 516, width: 1156, height: 52 }, { fontSize: 22, color: C.muted, alignment: 'center' });
    footer(slide, 7);
    notes(slide, [`${ROOT}/docs/ops/advertiser-proof.md`, `${ROOT}/lib/analytics.js`]);
  }

  // 8 — pilot sequence, based on Codex Grid's three-milestone timeline.
  {
    const slide = deck.slides.add();
    slide.background.fill = C.canvas;
    addTitle(slide, 8, 'Start with one festival and one measurable visitor journey');
    rule(slide, 'pilot-line', 110, 316, 1060, C.ink, 2);
    const steps = [
      ['1 · Approve', 'Programme source, logo rights and launch dates.'],
      ['2 · Configure', 'Partner URL, filters, identity and event linkbacks.'],
      ['3 · Share & learn', 'Promote one map and review opens and referrals.'],
    ];
    const xs = [110, 480, 850];
    steps.forEach(([heading, body], index) => {
      const dot = slide.shapes.add({ geometry: 'ellipse', name: `pilot-dot-${index}`, position: { left: xs[index], top: 305, width: 22, height: 22 }, fill: index === 2 ? C.accent : C.ink, line: { style: 'solid', fill: C.canvas, width: 3 } });
      dot.bringToFront();
      text(slide, `pilot-title-${index}`, heading, { left: xs[index], top: 358, width: 310, height: 48 }, { fontSize: 27, bold: true });
      text(slide, `pilot-body-${index}`, body, { left: xs[index], top: 418, width: 300, height: 86 }, { fontSize: 20, color: C.muted });
    });
    box(slide, 'pilot-cta-box', { left: 54, top: 570, width: 1156, height: 68 }, C.accent, C.accent, 12);
    text(slide, 'pilot-cta', 'hello@okolo.events  ·  Request a festival map pilot', { left: 80, top: 588, width: 1104, height: 34 }, { fontSize: 24, bold: true, color: C.canvas, alignment: 'center', verticalAlignment: 'middle' });
    footer(slide, 8);
    notes(slide, ['mailto:hello@okolo.events?subject=Festival%20map%20partnership']);
  }

  for (const [index, slide] of deck.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, '0')}`;
    await writeBlob(`${PREVIEW}/${stem}.png`, await deck.export({ slide, format: 'png', scale: 1 }));
    await fs.writeFile(`${PREVIEW}/${stem}.layout.json`, await (await slide.export({ format: 'layout' })).text());
  }
  await writeBlob(`${PREVIEW}/montage.webp`, await deck.export({ format: 'webp', montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(deck);
  await pptx.save(FINAL);
  console.log(FINAL);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
