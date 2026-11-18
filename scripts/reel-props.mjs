#!/usr/bin/env node
// Export a frozen weekend digest as input props for the weekly Remotion reel
// (video/). Reads the SAME snapshot the carousel, newsletter and weekend page
// use, so the reel can never disagree with them, and adds each pick's map
// coordinates for the pin scene. Never builds a digest (same rule as
// publish-social.mjs): prepare it on the desk / `npm run digest` first.
//
//   npm run reel:props -- --channel linz                 # this weekend
//   npm run reel:props -- --channel linz --weekend 2026-11-13
//
// Writes video/data/<slug>-<friday>.json and video/data/current.json (what the
// Studio + `npm run render` in video/ pick up). Facts only, no source prose or
// images (hard rule 1).

import fs from 'node:fs/promises';
import path from 'node:path';
import { getChannel, brandName, CHANNELS } from '../lib/city-channels.js';
import { loadDigest, loadDigestFor } from '../lib/digest.js';
import { eventsByIds, listDigestKeys } from '../lib/db.js';
import { CATS, P } from '../lib/icons.js';

const args = process.argv.slice(2);
const val = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : dflt;
};

const channel = getChannel(val('channel', 'linz'));
if (!channel) {
  console.error(`unknown channel. Known: ${CHANNELS.map((c) => c.slug).join(', ')}`);
  process.exit(1);
}

const weekend = val('weekend', null);
const digest = weekend ? await loadDigestFor(channel, weekend) : await loadDigest(channel);
if (!digest) {
  const fridays = (await listDigestKeys()).filter((k) => k.slug === channel.slug).map((k) => k.friday).sort();
  console.error(
    `no digest snapshot for ${channel.slug}${weekend ? ` weekend ${weekend}` : ' this weekend'}. ` +
      `Prepare it first (npm run digest -- --channel ${channel.slug}) or pass --weekend. ` +
      `Latest frozen: ${fridays.slice(-3).join(', ') || 'none'}`,
  );
  process.exit(1);
}
if (!digest.items.length) {
  console.error('digest has no picks — nothing to put in a reel');
  process.exit(1);
}

// Coordinates for the pin scene. eventsByIds is published-only, so a pick that
// has since been unpublished simply gets no pin (it still gets its card —
// the frozen digest is the editorial record).
const rows = await eventsByIds(digest.items.map((it) => it.id));
const geo = new Map(rows.map((r) => [String(r.id), r]));

const friday = digest.window?.friday || weekend || null;
const props = {
  channel: {
    slug: channel.slug,
    handle: channel.handle,
    city: brandName(channel),
    lang: channel.lang,
    lat: channel.lat,
    lng: channel.lng,
    radiusKm: channel.radiusKm,
  },
  label: digest.label,
  friday,
  items: digest.items.map((it) => {
    const g = geo.get(String(it.id));
    return {
      id: it.id,
      title: it.title,
      when: it.when,
      venue: it.venue,
      town: it.town,
      badges: it.badges || [],
      cat: it.cat,
      color: CATS[it.cat]?.color || CATS.family.color,
      glyph: P[it.cat] || P.family,
      highlight: it.highlight || null,
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      // A pin shown at street zoom claims an exact spot. Only venue/address
      // geocodes earn that; a town centroid (or a "venue" that is just the town
      // name) is drawn as an area instead (hard rule 5: never fake precision).
      precise: Boolean(
        g && g.geo_precision && g.geo_precision !== 'town' &&
          (it.venue || '').trim().toLowerCase() !== (it.town || '').trim().toLowerCase(),
      ),
    };
  }),
};

// Paid placements must stay labelled on every surface (digest.js `highlight`
// contract). The reel template has no Anzeige treatment yet, so refuse rather
// than render a gold pick that looks organic.
const gold = props.items.filter((it) => it.highlight === 'gold');
if (gold.length) {
  console.error(`refusing: ${gold.length} paid (gold) pick(s) and the reel has no „Anzeige" label yet`);
  process.exit(1);
}

const dir = path.join(process.cwd(), 'video', 'data');
await fs.mkdir(dir, { recursive: true });
const json = JSON.stringify(props, null, 2);
const file = path.join(dir, `${channel.slug}-${friday || 'current'}.json`);
await fs.writeFile(file, json);
await fs.writeFile(path.join(dir, 'current.json'), json);
const pinned = props.items.filter((it) => it.lat != null).length;
console.log(`wrote ${path.relative(process.cwd(), file)} + current.json — ${props.items.length} picks, ${pinned} with pins, "${props.label}"`);
process.exit(0);
