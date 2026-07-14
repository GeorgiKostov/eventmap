// Seed the DB from miner output files in data/mined/*.json.
// Each file: { source_registry: [...], events: [...] } (see briefs/).
// Usage: npm run seed
//        npm run seed -- --scope stuttgart-40km
//        npm run seed -- --file data/mined/events-stuttgart-city-2026-07-13.json
import fs from 'fs';
import path from 'path';
import { upsertEvent, upsertSource, expireFinished, closeDb } from '../lib/db.js';
import { geocodeEvent } from '../lib/geocode.js';
import { CRAWL_SCOPES, isWithinCrawlScope, scopeFromCatalog } from '../lib/crawl-scopes.js';
import { makeStartsAt } from '../lib/event-time.js';

const MINED_DIR = path.join(process.cwd(), 'data', 'mined');
const CAT_EMOJI = {
  family: '🎈', festival: '🎪', market: '🧺', music: '🎶',
  culture: '🎭', food: '🥨', sport: '⚽', workshop: '🎨',
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function normalizeEvent(raw) {
  if (!raw.title || !raw.date_start) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date_start)) return null;
  const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '');
  const time = validTime(raw.time_start) ? raw.time_start : null;
  const starts_at = makeStartsAt(raw.date_start, time);
  let ends_at = null;
  if (raw.date_end || raw.time_end) {
    const de = /^\d{4}-\d{2}-\d{2}$/.test(raw.date_end || '') ? raw.date_end : raw.date_start;
    const te = validTime(raw.time_end) ? raw.time_end : '23:59';
    ends_at = `${de}T${te}`;
    if (ends_at <= starts_at) ends_at = null;
  }
  const cats = (raw.categories || []).filter((c) => CAT_EMOJI[c]);
  return {
    title: String(raw.title).slice(0, 200),
    description: raw.description_short || raw.description || null,
    starts_at,
    ends_at,
    // Unknown time is NOT an all-day event — see lib/event-time.js. all_day is a
    // claim ("turn up whenever"), and silence from a source is not that claim.
    all_day: 0,
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
  const requestedScopeId = argValue('--scope');
  if (requestedScopeId && !CRAWL_SCOPES[requestedScopeId]) {
    throw new Error(`Unknown crawl scope "${requestedScopeId}". Known scopes: ${Object.keys(CRAWL_SCOPES).join(', ')}`);
  }
  const requestedFile = argValue('--file');
  let files = fs.readdirSync(MINED_DIR).filter((f) => f.endsWith('.json'));
  if (requestedFile) {
    const basename = path.basename(requestedFile);
    files = files.filter((file) => file === basename);
    if (!files.length) throw new Error(`Mined file not found: ${requestedFile}`);
  }
  if (!files.length) {
    console.log(`No files in ${MINED_DIR} — nothing to seed.`);
    return;
  }
  let ok = 0, skipped = 0, geoFail = 0, updated = 0, outsideScope = 0, sourceScopeFail = 0;
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(MINED_DIR, file), 'utf8'));
    const scopeId = data?._meta?.scope || data?.scope || null;
    if (requestedScopeId && scopeId !== requestedScopeId) continue;
    const scope = scopeFromCatalog(data);
    if (scopeId && !scope) {
      throw new Error(`Unknown crawl scope "${scopeId}" in ${file}. Known scopes: ${Object.keys(CRAWL_SCOPES).join(', ')}`);
    }
    // Source-registry rows rarely carry a country; inherit it from the file's
    // events so seeding a BG file never re-tags its sources back to 'AT' (which
    // would break the recrawl geocode — sources default to 'AT' in upsertSource).
    const fileCountry = data.country || (data.events || []).find((e) => e.country)?.country || scope?.country || 'AT';
    for (const s of data.source_registry || []) {
      const country = s.country || fileCountry;
      if (scope && (country !== scope.country || s.region !== scope.sourceRegion)) {
        sourceScopeFail++;
        continue;
      }
      await upsertSource({ ...s, country });
    }
    for (const raw of data.events || []) {
      const ev = normalizeEvent(raw);
      if (!ev) { skipped++; continue; }
      if (scope && ev.country !== scope.country) { skipped++; continue; }
      // Prefer coordinates the miner extracted from the source; else geocode.
      const geo = (ev.lat != null && ev.lng != null)
        ? { lat: ev.lat, lng: ev.lng, geo_precision: 'venue' }
        : await geocodeEvent(ev, { jitterTown: !scope });
      if (!geo) { geoFail++; continue; }
      if (scope && !isWithinCrawlScope(geo, scope)) { outsideScope++; continue; }
      const res = await upsertEvent({ ...ev, lat: geo.lat, lng: geo.lng, geo_precision: geo.geo_precision });
      res.updated ? updated++ : ok++;
      process.stdout.write(`  ${res.updated ? '↻' : '+'} ${ev.starts_at.slice(0, 10)} ${ev.title} @ ${ev.town} [${geo.geo_precision}]\n`);
    }
  }
  if (requestedScopeId) console.log(`Processed only crawl scope: ${requestedScopeId}`);
  const expired = await expireFinished();
  console.log(`\nSeed done: ${ok} inserted, ${updated} updated, ${skipped} invalid, ${geoFail} un-geocodable, ${expired} expired.`);
  if (outsideScope || sourceScopeFail) {
    console.log(`Scope guard: ${outsideScope} out-of-radius event(s), ${sourceScopeFail} mismatched source row(s) skipped.`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closeDb);
