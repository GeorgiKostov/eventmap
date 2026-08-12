#!/usr/bin/env node
// Publish the five editorially verified eclipse-viewing locations to Okolo,
// generate city-specific social cards, and optionally publish them through the
// existing Meta Graph API path.
//
//   npm run eclipse
//   npm run eclipse -- --publish --channel both --target both

// The default is safe and repeatable: upsert the map entries, regenerate the
// local assets, and print the captions. Social publishing requires --publish.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getChannel } from '../lib/city-channels.js';
import { upsertEvent, metaGet, metaSet, metaClaim, metaDelete, closeDb } from '../lib/db.js';
import { missingSocialConfig, publishEditorialCarouselAndLedger } from '../lib/social-publish.js';

const DATE = '2026-08-12';
const SLUG = 'eclipse-locations';
const ASSET_ROOT = 'social/eclipse-2026-08-12';
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://okolo.events').replace(/\/$/, '');
const args = process.argv.slice(2);
const publish = args.includes('--publish');
const force = args.includes('--force');
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const channelArg = value('channel', 'both');
const targetArg = value('target', 'both');
const channelSlugs = channelArg === 'both' ? ['linz', 'wien'] : [channelArg];
const targets = targetArg === 'both' ? ['instagram', 'facebook'] : [targetArg];

if (channelSlugs.some((slug) => !['linz', 'wien'].includes(slug))) {
  throw new Error('pass --channel linz|wien|both');
}
if (targets.some((target) => !['instagram', 'facebook'].includes(target))) {
  throw new Error('pass --target instagram|facebook|both');
}

const events = [
  {
    key: 'guckerstein',
    kind: 'event',
    title: 'Sonnenfinsternis schauen: Guckerstein',
    description: 'Okolos stärkster Aussichtstipp nahe Linz: ein freier West-Nordwest-Blick über Ottensheim und das Eferdinger Becken. Der Aussichtspunkt liegt am Stamperlweg und ist nur zu Fuß erreichbar. Feste Schuhe, Wasser und eine Lampe für den Rückweg mitnehmen. Wetterabhängig; nur mit geeigneter Sonnenfinsternisbrille beobachten.',
    starts_at: '2026-08-12T19:22', ends_at: '2026-08-12T20:22', all_day: false,
    lat: 48.3377434, lng: 14.2054483, geo_precision: 'venue',
    venue: 'Guckerstein', address: 'Dürnberg', town: 'Ottensheim', country: 'AT',
    categories: ['eclipse', 'family'], is_free: true, indoor: false, emoji: '🌘',
    src_kind: 'manual', source_name: 'Land Oberösterreich – Stamperlweg',
    source_url: 'https://guide.oberoesterreich.at/oesterreich-tour/detail/430008144/stamperlweg.html',
  },
  {
    key: 'elisabethhoehe',
    kind: 'event',
    title: 'Sonnenfinsternis schauen: Elisabethhöhe',
    description: 'Okolos familienfreundlichster Aussichtstipp bei Wien: sehr freie Sicht zum West-Nordwest-Horizont und ein Waldspielplatz vor Ort. Vom Ende der Bergstraße führt eine leicht ansteigende Forststraße rund 500 Meter zur Elisabethhöhe. Wetterabhängig; nur mit geeigneter Sonnenfinsternisbrille beobachten.',
    starts_at: '2026-08-12T19:22', ends_at: '2026-08-12T20:14', all_day: false,
    lat: 48.3207592, lng: 16.3630030, geo_precision: 'venue',
    venue: 'Elisabethhöhe am Bisamberg', address: 'Bergstraße', town: 'Bisamberg', country: 'AT',
    categories: ['eclipse', 'family'], is_free: true, indoor: false, emoji: '🌘',
    src_kind: 'manual', source_name: 'Stadt Wien – Waldspielplatz Elisabethhöhe',
    source_url: 'https://www.wien.gv.at/freizeit/waldspielplatz-bisamberg',
  },
  {
    key: 'spotterhuegel',
    kind: 'event',
    title: 'Sonnenfinsternis schauen: Spotterhügel Flughafen Wien',
    description: 'Okolos Alternative für eine besonders freie West-Nordwest-Sicht südöstlich von Wien. Der Spotterhügel ist vom Parkplatz zu Fuß erreichbar; der letzte Abschnitt führt über einen Feldweg. Früh ankommen und Rücksicht auf Landwirtschaft, Zufahrten und andere Besucher nehmen. Wetterabhängig; nur mit geeigneter Sonnenfinsternisbrille beobachten.',
    starts_at: '2026-08-12T19:22', ends_at: '2026-08-12T20:14', all_day: false,
    lat: 48.1011509, lng: 16.5903801, geo_precision: 'venue',
    venue: 'Spotterhügel Flughafen Wien', address: null, town: 'Klein-Neusiedl', country: 'AT',
    categories: ['eclipse', 'family'], is_free: true, indoor: false, emoji: '🌘',
    src_kind: 'manual', source_name: 'Flughafenfreunde Wien',
    source_url: 'https://www.flughafenfreunde.at/event/spotterfruehstueck2025/',
  },
  {
    key: 'neue-donau',
    kind: 'event',
    title: 'Sonnenfinsternis 2026 an der Neuen Donau',
    description: 'Kostenlose gemeinsame Beobachtung der Wiener Volkshochschulen am linken Ufer der Neuen Donau bei Reichsbrücke/Copa Beach. Vor Ort werden Solar Viewer ausgegeben. Die Sonne verschwindet hier voraussichtlich schon gegen 19:50 hinter den Wienerwaldhügeln – vor der stärksten Phase.',
    starts_at: '2026-08-12T19:20', ends_at: '2026-08-12T20:00', all_day: false,
    lat: 48.2297926, lng: 16.4125830, geo_precision: 'venue',
    venue: 'Copa Beach bei der Reichsbrücke', address: 'Neue Donau, linkes Ufer', town: 'Wien', country: 'AT',
    categories: ['eclipse', 'family'], is_free: true, indoor: false, emoji: '🌘',
    src_kind: 'manual', source_name: 'Stadt Wien / Wiener Volkshochschulen',
    source_url: 'https://presse.wien.gv.at/presse/2026/07/28/sonnenfinsternis-2026-spektakulaeres-himmelsschauspiel-ueber-oesterreich-wiener-volkshochschulen-laden-zur-gemeinsamen-beobachtung-ein',
  },
  {
    key: 'urania',
    kind: 'event',
    title: 'Sonnenfinsternis 2026 in der Wiener Urania',
    description: 'Kostenlose Beobachtung mit Solar Viewern auf der Dachterrasse sowie ein fachkundig kommentierter Livestream im Dachsaal. Die Sicht von der Terrasse endet wegen Gebäuden voraussichtlich schon gegen 19:50; der Livestream läuft bis 20:45 und ist die wetterfeste Alternative.',
    starts_at: '2026-08-12T19:20', ends_at: '2026-08-12T20:45', all_day: false,
    lat: 48.211289, lng: 16.383235, geo_precision: 'venue',
    venue: 'VHS Wiener Urania', address: 'Uraniastraße 1, 1010 Wien', town: 'Wien', country: 'AT',
    categories: ['eclipse', 'culture', 'family'], is_free: true, indoor: null, emoji: '🌘',
    src_kind: 'manual', source_name: 'Stadt Wien / Wiener Volkshochschulen',
    source_url: 'https://presse.wien.gv.at/presse/2026/07/28/sonnenfinsternis-2026-spektakulaeres-himmelsschauspiel-ueber-oesterreich-wiener-volkshochschulen-laden-zur-gemeinsamen-beobachtung-ein',
  },
];

const ids = {};
for (const event of events) {
  const { key, ...row } = event;
  const result = await upsertEvent(row);
  ids[key] = String(result.id);
  console.log(`${result.updated ? 'updated' : 'inserted'} event ${result.id}: ${row.title}`);
}

const packages = {
  linz: {
    caption: `🌘 Heute: Sonnenfinsternis bei Linz\n\nUnser geprüfter Aussichtstipp ist der Guckerstein bei Ottensheim. Dort passt der freie Blick Richtung West-Nordwest zur extrem tief stehenden Sonne.\n\nBeginn: ca. 19:22 Uhr\nStärkste Phase: ca. 20:14 Uhr\nSonnenuntergang: ca. 20:22 Uhr\n\nDer Aussichtspunkt ist nur zu Fuß erreichbar. Feste Schuhe, Wasser und eine Lampe für den Rückweg mitnehmen. Früh da sein und den aktuellen Westhorizont prüfen.\n\n⚠️ Die Finsternis ist in Österreich nur partiell: ausschließlich mit intakter Sonnenfinsternisbrille nach ISO 12312-2 beobachten. Normale Sonnenbrillen reichen nicht. Fernglas, Kamera oder Teleskop brauchen einen eigenen Sonnenfilter VOR der Optik.\n\nAuf der Okolo-Karte: ${BASE}/?lat=48.33774&lng=14.20545\n\n#linz #sonnenfinsternis #ottensheim #oberösterreich #linzmitkindern #okolo`,
    slides: [
      { kicker: 'HEUTE · 12. AUGUST', title: ['Sonnen-', 'finsternis'], subtitle: 'Der geprüfte Aussichtstipp rund um Linz', accent: '#26356F' },
      { kicker: 'BESTER HORIZONT-TIPP', title: ['Guckerstein'], subtitle: 'Ottensheim · freier Blick nach West-Nordwest', body: ['Beginn ca. 19:22', 'Stärkste Phase ca. 20:14', 'Sonnenuntergang ca. 20:22'], accent: '#C93A5B' },
      { kicker: 'BITTE SICHER SCHAUEN', title: ['Augen schützen'], subtitle: 'Die Finsternis bleibt in Österreich partiell.', body: ['ISO 12312-2 Sonnenfinsternisbrille', 'Normale Sonnenbrille reicht nicht', 'Eigener Frontfilter für Kamera/Fernglas'], accent: '#26356F' },
    ],
  },
  wien: {
    caption: `🌘 Heute: Sonnenfinsternis rund um Wien\n\nUnsere geprüften Optionen:\n\n🥇 Elisabethhöhe am Bisamberg – beste familienfreundliche Horizontsicht; rund 500 m Fußweg ab Ende Bergstraße.\n✈️ Spotterhügel Flughafen Wien – sehr freie Sicht, aber Feldweg und längere Anreise.\n👨‍👩‍👧 Neue Donau/Copa Beach – kostenlose Solar Viewer und gemeinsame Beobachtung; die Sonne verschwindet dort schon ca. 19:50.\n🎥 Wiener Urania – Dachterrasse plus kommentierter Livestream bis 20:45; beste Schlechtwetter-Option.\n\nBeginn in Wien: ca. 19:22 Uhr. Die stärkste sichtbare Phase liegt unmittelbar vor Sonnenuntergang.\n\n⚠️ Ausschließlich mit intakter Sonnenfinsternisbrille nach ISO 12312-2 beobachten. Normale Sonnenbrillen reichen nicht. Fernglas, Kamera oder Teleskop brauchen einen eigenen Sonnenfilter VOR der Optik.\n\nAuf der Okolo-Karte: ${BASE}/?lat=48.255&lng=16.42\n\n#wien #sonnenfinsternis #wienmitkindern #bisamberg #donauinsel #okolo`,
    slides: [
      { kicker: 'HEUTE · 12. AUGUST', title: ['Sonnen-', 'finsternis'], subtitle: 'Die geprüften Aussichtstipps rund um Wien', accent: '#26356F' },
      { kicker: 'BESTE FREIE SICHT', title: ['Elisabethhöhe', '+ Spotterhügel'], subtitle: 'Bisamberg familienfreundlich · Flughafen besonders frei', body: ['Beginn ca. 19:22', 'Stärkste Phase kurz vor Sonnenuntergang', 'Früh ankommen · West-Nordwest prüfen'], accent: '#C93A5B' },
      { kicker: 'GEMEINSAM & MIT BACKUP', title: ['Neue Donau', '+ Urania'], subtitle: 'Solar Viewer vor Ort · Urania mit Livestream', body: ['Neue Donau: Sicht nur bis ca. 19:50', 'Urania: Livestream bis 20:45', 'Beide Angebote kostenlos'], accent: '#3F7CA8' },
      { kicker: 'BITTE SICHER SCHAUEN', title: ['Augen schützen'], subtitle: 'Die Finsternis bleibt in Österreich partiell.', body: ['ISO 12312-2 Sonnenfinsternisbrille', 'Normale Sonnenbrille reicht nicht', 'Eigener Frontfilter für Kamera/Fernglas'], accent: '#26356F' },
    ],
  },
};

const esc = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const textLines = (items, x, y, { size, weight = 400, color = '#212B28', gap = size * 1.2 } = {}) =>
  `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">`
  + items.map((line, i) => `<tspan x="${x}" dy="${i ? gap : 0}">${esc(line)}</tspan>`).join('') + '</text>';
const eclipseGlyph = (x, y, scale = 1, color = '#fff') =>
  `<path d="M20 15.5A8 8 0 1 1 8.5 4 6.5 6.5 0 0 0 20 15.5Z" transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;

function slideSvg(channel, slide, index, count) {
  const body = slide.body || [];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="#F3F2EC"/>
    <rect width="1080" height="250" fill="${slide.accent}"/>
    <circle cx="930" cy="88" r="260" fill="#fff" fill-opacity=".07"/>
    ${eclipseGlyph(72, 62, 2.1)}
    ${textLines([channel.handle], 142, 105, { size: 34, weight: 700, color: '#fff' })}
    ${textLines([slide.kicker], 72, 326, { size: 29, weight: 700, color: slide.accent })}
    ${textLines(slide.title, 72, 445, { size: slide.title.some((x) => x.length > 16) ? 64 : 84, weight: 700, gap: 92 })}
    ${textLines([slide.subtitle], 72, slide.title.length > 1 ? 680 : 585, { size: 34, color: '#5E6966' })}
    ${body.map((line, i) => `<rect x="72" y="${770 + i * 125}" width="936" height="94" rx="47" fill="#fff"/><circle cx="122" cy="${817 + i * 125}" r="27" fill="${slide.accent}"/>${eclipseGlyph(109, 804 + i * 125, 1.08)}${textLines([line], 170, 829 + i * 125, { size: 30, weight: 700 })}`).join('')}
    ${textLines(['okolo.events'], 72, 1278, { size: 29, weight: 700, color: '#5E6966' })}
    ${textLines([`${index + 1} / ${count}`], 930, 1278, { size: 29, weight: 700, color: slide.accent })}
  </svg>`;
}

for (const slug of channelSlugs) {
  const channel = getChannel(slug);
  const pack = packages[slug];
  const relDir = `${ASSET_ROOT}/${slug}`;
  const outDir = path.join(process.cwd(), 'public', ...relDir.split('/'));
  await mkdir(outDir, { recursive: true });
  for (const [index, slide] of pack.slides.entries()) {
    const file = path.join(outDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
    await sharp(Buffer.from(slideSvg(channel, slide, index, pack.slides.length))).png().toFile(file);
    console.log(`generated ${path.relative(process.cwd(), file)}`);
  }
  const imageUrls = pack.slides.map((_, i) => `${BASE}/${relDir}/slide-${String(i + 1).padStart(2, '0')}.png`);
  console.log(`\n${channel.handle} caption (${pack.caption.length} chars):\n${pack.caption}\n`);

  if (!publish) continue;
  for (const target of targets) {
    const missing = missingSocialConfig(target, channel);
    if (missing.length) throw new Error(`${slug}/${target} not configured: ${missing.join(', ')}`);
  }
  for (const url of imageUrls) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/png')) {
      throw new Error(`public social asset is not ready: ${url} → ${res.status} ${res.headers.get('content-type')}`);
    }
    console.log(`verified public asset: ${url}`);
  }
  for (const target of targets) {
    const record = await publishEditorialCarouselAndLedger({
      channel, slug: SLUG, date: DATE, imageUrls, caption: pack.caption, target, force,
      metaGet, metaSet, metaClaim, metaDelete,
    });
    console.log(`posted ${slug}/${target}: id=${record.id} permalink=${record.permalink || '(none)'}`);
  }
}

console.log(`event ids: ${JSON.stringify(ids)}`);
if (!publish) console.log('\n(dry run — map entries and assets are ready; pass --publish only after deploying the public assets)');
await closeDb();
