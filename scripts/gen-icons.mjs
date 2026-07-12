// Rasterize the okolo map-pin into the PNG icons Android/iOS need for install.
// Two source shapes: a rounded tile ("any" purpose) and a full-bleed white
// square ("maskable" + apple-touch, where the OS applies its own rounding/crop).
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const PIN = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z';

const tile = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#ffffff"/>
  <path transform="translate(14 14) scale(3)" fill-rule="evenodd" fill="#c93a5b" d="${PIN}"/>
</svg>`;

// full-bleed: white to every edge, pin kept inside the maskable safe zone
const bleed = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#ffffff"/>
  <path transform="translate(9 8) scale(3.4)" fill-rule="evenodd" fill="#c93a5b" d="${PIN}"/>
</svg>`;

const jobs = [
  ['public/icon-192.png', tile(192)],
  ['public/icon-512.png', tile(512)],
  ['public/icon-maskable-192.png', bleed(192)],
  ['public/icon-maskable-512.png', bleed(512)],
  ['app/apple-icon.png', bleed(180)],
];

await mkdir('public', { recursive: true });
for (const [out, svg] of jobs) {
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('wrote', out);
}
