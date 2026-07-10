// Recrawl registered sources every few days: fetch page → Claude extraction →
// geocode → upsert (dedup by title+day+town) → expire finished events.
// Usage: npm run crawl          (all sources marked works=1)
//        npm run crawl -- --url https://...   (single source)
// Requires Claude API credentials (ANTHROPIC_API_KEY or `ant auth login`).
import { getDb, upsertEvent, expireFinished } from '../lib/db.js';
import { geocodeEvent } from '../lib/geocode.js';
import { extractFromPage } from '../lib/extract.js';

const CAT_EMOJI = {
  family: '🎈', festival: '🎪', market: '🧺', music: '🎶',
  culture: '🎭', food: '🥨', sport: '⚽', workshop: '🎨',
};

// Cheap HTML → text: strip tags/scripts, collapse whitespace. Claude handles the mess.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ouml;/g, 'ö').replace(/&auml;/g, 'ä').replace(/&uuml;/g, 'ü')
    .replace(/&Ouml;/g, 'Ö').replace(/&Auml;/g, 'Ä').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function crawlSource(src) {
  console.log(`\n→ ${src.name} (${src.url})`);
  let html;
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'umkreis-prototype/0.1 (local event map; contact: bobojojok@gmail.com)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.log(`  fetch failed: ${e.message}`);
    return { ok: 0, fail: 0, fetchError: true };
  }
  const text = htmlToText(html);
  if (text.length < 200) { console.log('  page too thin, skipping'); return { ok: 0, fail: 0 }; }

  let events;
  try {
    events = await extractFromPage({ text, sourceName: src.name, town: src.town });
  } catch (e) {
    console.log(`  extraction failed: ${e.message}`);
    return { ok: 0, fail: 1 };
  }

  let ok = 0;
  for (const raw of events) {
    if (!raw.title || !raw.date_start) continue;
    const time = /^\d{2}:\d{2}$/.test(raw.time_start || '') ? raw.time_start : null;
    const starts_at = `${raw.date_start}T${time || '09:00'}`;
    let ends_at = raw.time_end && /^\d{2}:\d{2}$/.test(raw.time_end)
      ? `${raw.date_end || raw.date_start}T${raw.time_end}` : null;
    if (ends_at && ends_at <= starts_at) ends_at = null; // overnight/garbled end times
    const ev = {
      title: raw.title,
      description: raw.description || null,
      starts_at,
      ends_at,
      all_day: time ? 0 : 1,
      venue: raw.venue, address: raw.address, town: raw.town || src.town,
      categories: (raw.categories || []).filter((c) => CAT_EMOJI[c]),
      is_free: raw.is_free, age_min: raw.age_min, age_max: raw.age_max, indoor: raw.indoor,
      emoji: CAT_EMOJI[(raw.categories || [])[0]] || '📌',
      src_kind: 'crawl',
      source_name: src.name,
      source_url: src.url,
    };
    const geo = await geocodeEvent(ev);
    if (!geo) continue;
    upsertEvent({ ...ev, lat: geo.lat, lng: geo.lng, geo_precision: geo.geo_precision });
    ok++;
  }
  console.log(`  ${ok}/${events.length} events upserted`);
  return { ok, fail: 0 };
}

async function main() {
  const db = getDb();
  const urlArg = process.argv.indexOf('--url');
  const sources =
    urlArg > -1
      ? db.prepare('SELECT * FROM sources WHERE url=?').all(process.argv[urlArg + 1])
      : db.prepare('SELECT * FROM sources WHERE works=1').all();
  console.log(`Crawling ${sources.length} source(s) with model ${process.env.EXTRACT_MODEL || 'claude-haiku-4-5'} …`);
  let total = 0;
  for (const src of sources) {
    const { ok } = await crawlSource(src);
    total += ok;
    db.prepare("UPDATE sources SET last_crawled=datetime('now') WHERE id=?").run(src.id);
  }
  const expired = expireFinished();
  console.log(`\nCrawl done: ${total} events upserted, ${expired} expired.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
