// Seed the DB from miner output files in data/mined/*.json.
// Each file: { source_registry: [...], events: [...] } (see briefs/).
// Usage: npm run seed
import fs from 'fs';
import path from 'path';
import { upsertEvent, upsertSource, expireFinished, closeDb } from '../lib/db.js';
import { geocodeEvent } from '../lib/geocode.js';

const MINED_DIR = path.join(process.cwd(), 'data', 'mined');
const CAT_EMOJI = {
  family: '🎈', festival: '🎪', market: '🧺', music: '🎶',
  culture: '🎭', food: '🥨', sport: '⚽', workshop: '🎨',
};

function normalizeEvent(raw) {
  if (!raw.title || !raw.date_start) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date_start)) return null;
  const time = /^\d{2}:\d{2}$/.test(raw.time_start || '') ? raw.time_start : null;
  const starts_at = `${raw.date_start}T${time || '09:00'}`;
  let ends_at = null;
  if (raw.date_end || raw.time_end) {
    const de = /^\d{4}-\d{2}-\d{2}$/.test(raw.date_end || '') ? raw.date_end : raw.date_start;
    const te = /^\d{2}:\d{2}$/.test(raw.time_end || '') ? raw.time_end : '23:59';
    ends_at = `${de}T${te}`;
    if (ends_at <= starts_at) ends_at = null;
  }
  const cats = (raw.categories || []).filter((c) => CAT_EMOJI[c]);
  return {
    title: String(raw.title).slice(0, 200),
    description: raw.description_short || raw.description || null,
    starts_at,
    ends_at,
    all_day: time ? 0 : 1,
    venue: raw.venue || null,
    address: raw.address_text || raw.address || null,
    town: raw.town || null,
    country: raw.country || 'AT',
    categories: cats.length ? cats : ['other'],
    is_free: raw.is_free ?? null,
    age_min: Number.isInteger(raw.age_min) ? raw.age_min : null,
    age_max: Number.isInteger(raw.age_max) ? raw.age_max : null,
    indoor: raw.indoor ?? null,
    // Source-extracted coordinates (miner read them off the page — map embed /
    // JSON-LD geo). When present we trust them over geocoding; never fabricated.
    lat: Number.isFinite(raw.lat) ? raw.lat : null,
    lng: Number.isFinite(raw.lng) ? raw.lng : null,
    emoji: CAT_EMOJI[cats[0]] || '📌',
    src_kind: raw.src_kind || 'crawl',
    source_name: raw.source_name || null,
    source_url: raw.source_url || null,
  };
}

async function main() {
  const files = fs.readdirSync(MINED_DIR).filter((f) => f.endsWith('.json'));
  if (!files.length) {
    console.log(`No files in ${MINED_DIR} — nothing to seed.`);
    return;
  }
  let ok = 0, skipped = 0, geoFail = 0, updated = 0;
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(MINED_DIR, file), 'utf8'));
    for (const s of data.source_registry || []) await upsertSource(s);
    for (const raw of data.events || []) {
      const ev = normalizeEvent(raw);
      if (!ev) { skipped++; continue; }
      // Prefer coordinates the miner extracted from the source; else geocode.
      const geo = (ev.lat != null && ev.lng != null)
        ? { lat: ev.lat, lng: ev.lng, geo_precision: 'venue' }
        : await geocodeEvent(ev);
      if (!geo) { geoFail++; continue; }
      const res = await upsertEvent({ ...ev, lat: geo.lat, lng: geo.lng, geo_precision: geo.geo_precision });
      res.updated ? updated++ : ok++;
      process.stdout.write(`  ${res.updated ? '↻' : '+'} ${ev.starts_at.slice(0, 10)} ${ev.title} @ ${ev.town} [${geo.geo_precision}]\n`);
    }
  }
  const expired = await expireFinished();
  console.log(`\nSeed done: ${ok} inserted, ${updated} updated, ${skipped} invalid, ${geoFail} un-geocodable, ${expired} expired.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closeDb);
