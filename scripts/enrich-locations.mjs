// Location enrichment second hop (docs/design/big-city-quality.md §1 Stage 2).
// For published events stuck at geo_precision='town': first consult the venues
// registry (free), then fetch the event's own detail page (politeFetch +
// robots, same machinery as the crawl) and extract a real location from it —
// JSON-LD Event.location, the GEM2GO/RiS per-event iCal LOCATION line, or the
// detail table's Ort/Adresse rows — geocode that, and upgrade the event.
// Every resolution is written back into the venues registry so future crawls
// of the same venue resolve instantly.
//
// Never-fabricate guards: a resolved point must land within GUARD_KM of the
// event's current town centroid or it is rejected; nothing is upgraded past
// what actually geocoded; failures leave the event honestly at 'town'.
//
// Usage: node --env-file=.env.local scripts/enrich-locations.mjs            (dry-run, 5 AT city zones)
//        node --env-file=.env.local scripts/enrich-locations.mjs --write    (apply)
//        ... --zone linz            only one zone
//        ... --all                  every town-precision event, all countries
//        ... --limit 50             cap processed events (testing)
import postgres from 'postgres';
import { politeFetch, robotsAllowed } from '../lib/crawl-net.js';
import {
  geocodeEvent, forwardGeocode, distanceKm, normalizeName, isSentinelVenue,
} from '../lib/geocode.js';
import { getVenue, upsertVenue, closeDb } from '../lib/db.js';
import { extractLocationFromText } from '../lib/extract.js';

const ZONES = {
  wien: { lat: 48.2082, lng: 16.3738 },
  linz: { lat: 48.3069, lng: 14.2858 },
  graz: { lat: 47.0707, lng: 15.4395 },
  salzburg: { lat: 47.8095, lng: 13.055 },
  innsbruck: { lat: 47.2692, lng: 11.4041 },
};
const ZONE_KM = 40;
const GUARD_KM = 30; // resolved point must stay near the event's town

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ALL = args.includes('--all');
// --llm adds a final rung: when no structured location was found on a fetched
// detail page, ask the extraction model (lib/extract.js — Gemini, Claude
// fallback) what the page states, strings only; geocode + 30km guard decide.
// ~€0.5 per 1,400 pages on Flash-Lite. Off by default.
const LLM = args.includes('--llm');
const zoneArg = args.includes('--zone') ? args[args.indexOf('--zone') + 1] : null;
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 2, connection: { search_path: 'umkreis' } });

// --- candidate selection ---
// Every town-precision event is a candidate for the (free, DB-only) registry
// rung — a venue resolved by a later run must still propagate to its siblings.
// The EXPENSIVE rung (fetch the page + pay a model to read it) is gated below
// on enrich_attempted_at: a page we already read and found no location in does
// not sprout one overnight, so re-paying for it is pure waste. That gate is why
// this script is safely re-runnable / cron-able. --retry-after 0 forces a redo.
const RETRY_DAYS = args.includes('--retry-after') ? Number(args[args.indexOf('--retry-after') + 1]) : 30;
const rows = await sql`
  select id, title, town, country, venue, address, lat, lng, source_url, enrich_attempted_at
  from events
  where kind='event' and status='published' and geo_precision='town'
  order by town, source_url`;
const recentlyAttempted = (ev) =>
  ev.enrich_attempted_at && Date.now() - new Date(ev.enrich_attempted_at).getTime() < RETRY_DAYS * 86400000;
const zones = zoneArg ? { [zoneArg]: ZONES[zoneArg] } : ZONES;
if (zoneArg && !ZONES[zoneArg]) { console.error(`unknown zone ${zoneArg}`); process.exit(1); }
const inZones = (e) => Object.values(zones).some((z) => distanceKm(e, z) <= ZONE_KM);
const candidates = rows.filter((e) => ALL || inZones({ lat: e.lat, lng: e.lng }));
console.log(`${rows.length} town-precision events; ${candidates.length} in scope (${ALL ? 'all' : Object.keys(zones).join('/')})${WRITE ? '' : ' [DRY-RUN]'}`);

// --- extraction helpers ---
const decodeUrl = (u) => u.replace(/&amp;/g, '&');

function jsonLdLocation(html, eventTitle) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data; try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const nodes = [];
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === 'object') { nodes.push(n); if (n['@graph']) walk(n['@graph']); }
    };
    walk(data);
    for (const n of nodes) {
      const type = [].concat(n['@type'] || []).join(',');
      if (!/Event/i.test(type) || !n.location) continue;
      // On a page that might list several events, only trust a node whose name
      // overlaps the event we're enriching.
      const tn = new Set(normalizeName(eventTitle).split(' ').filter((w) => w.length > 2));
      const nn = normalizeName(n.name || '').split(' ').filter((w) => w.length > 2);
      const overlap = nn.filter((w) => tn.has(w)).length;
      if (nn.length && tn.size && overlap === 0) continue;
      const loc = Array.isArray(n.location) ? n.location[0] : n.location;
      const a = loc?.address && typeof loc.address === 'object' ? loc.address : {};
      const street = typeof loc?.address === 'string' ? loc.address : a.streetAddress || null;
      if (loc?.geo?.latitude && loc?.geo?.longitude) {
        return { direct: { lat: Number(loc.geo.latitude), lng: Number(loc.geo.longitude) }, venue: loc.name || null, street, locality: a.addressLocality || null };
      }
      if (loc?.name || street) return { venue: loc?.name || null, street, locality: a.addressLocality || null };
    }
  }
  return null;
}

// GEM2GO/RiS per-event iCal: LOCATION carries "venue street nr postcode town".
// A page can carry several CalendarService links (listing-ish pages, related
// events) — only trust one whose data-bez (URL-encoded event title) matches
// the event we're enriching, or a single unambiguous link.
async function icsLocation(html, pageUrl, eventTitle) {
  const links = [...html.matchAll(/<a[^>]*href="([^"]*(?:CalendarService\.ashx|\.ics)[^"]*)"[^>]*>/gi)];
  if (!links.length) return null;
  let chosen = null;
  if (links.length === 1) {
    chosen = links[0][1];
  } else {
    const tn = new Set(normalizeName(eventTitle).split(' ').filter((w) => w.length > 2));
    for (const l of links) {
      const bez = l[0].match(/data-bez="([^"]*)"/i);
      if (!bez) continue;
      const name = normalizeName(decodeURIComponent(bez[1].replace(/\+/g, ' ')));
      const overlap = name.split(' ').filter((w) => w.length > 2 && tn.has(w)).length;
      if (tn.size && overlap / tn.size >= 0.5) { chosen = l[1]; break; }
    }
    if (!chosen) return null; // ambiguous — never guess (hard rule 5)
  }
  const icsUrl = new URL(decodeUrl(chosen), pageUrl).toString();
  if (!(await robotsAllowed(icsUrl))) return null;
  const res = await politeFetch(icsUrl, { headers: { Accept: 'text/calendar' } });
  if (!res.ok) return null;
  const ics = await res.text();
  // Unfold continuation lines, then read LOCATION / GEO.
  const flat = ics.replace(/\r?\n[ \t]/g, '');
  const geo = flat.match(/^GEO[^:]*:(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?)/m);
  const loc = flat.match(/^LOCATION[^:]*:(.+)$/m);
  const text = loc ? loc[1].replace(/\\,/g, ',').replace(/\\n/g, ' ').replace(/\\;/g, ';').trim() : null;
  if (geo) return { direct: { lat: Number(geo[1]), lng: Number(geo[2]) }, text };
  return text ? { text } : null;
}

// GEM2GO/RiS detail table: <th scope="row">Ort</th><td>VENUE</td> (+ Adresse rows).
function tableLocation(html) {
  const pick = (label) => {
    const m = html.match(new RegExp(`<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i'));
    if (!m) return null;
    const v = m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    return v || null;
  };
  const ort = pick('(?:Veranstaltungs)?[Oo]rt') || pick('Treffpunkt');
  const adr = pick('Adresse') || pick('Anschrift');
  return ort || adr ? { venue: ort, street: adr } : null;
}

// A candidate's source_url is worth a second hop when it is a PER-EVENT page.
// Registered source URLs are listing pages (linkback fallbacks) — fetching one
// risks extracting a DIFFERENT event's location, so they're excluded, along
// with bare listing-path shapes and binary files.
const sourceUrls = new Set((await sql`select url from sources`).map((s) => s.url.replace(/\/$/, '')));
const looksDetailPage = (u) => {
  if (!u || /\.(pdf|jpg|jpeg|png)(\?|$)/i.test(u)) return false;
  const clean = decodeUrl(u).replace(/\/$/, '');
  if (sourceUrls.has(clean)) return false;
  if (/\/(home\/list|liste?|suche|search)\b/i.test(clean)) return false;
  if (/\/(veranstaltungen|termine|events|kalender|veranstaltungskalender)$/i.test(clean)) return false;
  try { return new URL(clean).pathname.length > 1; } catch { return false; }
};

// Recurring events share one detail URL — fetch each URL once per run.
const pageCache = new Map(); // url -> html | null
async function fetchDetail(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  let html = null;
  if (await robotsAllowed(url)) {
    const res = await politeFetch(url);
    if (res.ok) html = await res.text();
  }
  // Cap the cache — recurring dupes cluster adjacently in the town-ordered
  // list, so evicting old entries wholesale is safe.
  if (pageCache.size > 500) pageCache.clear();
  pageCache.set(url, html);
  return html;
}

// --- main loop ---
// Cheap tag-strip for the LLM rung (crawl.mjs has the canonical htmlToText,
// but that file auto-runs main() on import — consolidate when it's modularized).
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const stats = { registry: 0, jsonld: 0, ics: 0, table: 0, llm: 0, sentinel: 0, skipped: 0, nofetch: 0, unresolved: 0, guarded: 0, errors: 0 };
let processed = 0;
const t0 = Date.now();

for (const ev of candidates) {
  if (processed >= LIMIT) break;
  processed++;
  if (processed % 50 === 0) {
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`… ${processed}/${Math.min(candidates.length, LIMIT)} (${mins} min) — ${JSON.stringify(stats)}`);
  }
  try {
    const country = ev.country || 'AT';
    const hasVenue = ev.venue && !isSentinelVenue(ev.venue);
    if (ev.venue && !hasVenue) { stats.sentinel++; continue; }

    const apply = async (hit, precision, via, newVenue = null, newStreet = null) => {
      if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) return false;
      if (distanceKm(hit, ev) > GUARD_KM) { stats.guarded++; return false; }
      if (WRITE) {
        await sql`
          update events set lat=${hit.lat}, lng=${hit.lng}, geo_precision=${precision},
            venue=coalesce(nullif(venue,''), ${newVenue}),
            address=coalesce(nullif(address,''), ${newStreet}),
            updated_at=now()
          where id=${ev.id}`;
        const vname = hasVenue ? ev.venue : newVenue;
        if (vname && !isSentinelVenue(vname)) {
          await upsertVenue({
            name: vname, town: ev.town ?? null, country,
            name_norm: normalizeName(vname), town_norm: normalizeName(ev.town || ''),
            lat: hit.lat, lng: hit.lng, geo_precision: precision,
            resolved_via: via, source_url: ev.source_url ?? null,
          });
        }
      }
      return true;
    };

    // 1) registry (free — seeded from resolved events + places)
    if (hasVenue) {
      const reg = await getVenue(normalizeName(ev.venue), normalizeName(ev.town || ''), country);
      if (reg && await apply(reg, reg.geo_precision, 'registry')) { stats.registry++; continue; }
    }

    // 2) detail-page second hop — the expensive rung (network + model tokens).
    // Skip anything we already read within RETRY_DAYS: that page was proven
    // location-less, and paying to re-read it is the exact waste that made the
    // first --llm re-run resolve nothing for its first 1,500 events.
    if (recentlyAttempted(ev)) { stats.skipped++; continue; }
    if (!ev.source_url || !looksDetailPage(ev.source_url)) { stats.nofetch++; continue; }
    const pageUrl = decodeUrl(ev.source_url);
    const html = await fetchDetail(pageUrl);
    if (!html) { stats.nofetch++; continue; }
    // Stamp on FETCH, not on success: "we looked at this page" is the fact that
    // makes the next run cheaper, whether or not it yielded a location.
    if (WRITE) await sql`update events set enrich_attempted_at=now() where id=${ev.id}`;

    // 2a) JSON-LD Event.location
    const jl = jsonLdLocation(html, ev.title);
    if (jl) {
      if (jl.direct && await apply(jl.direct, 'venue', 'detail_page', jl.venue, jl.street)) { stats.jsonld++; continue; }
      const hit = await geocodeEvent(
        { venue: jl.venue, address: jl.street, town: jl.locality || ev.town, country },
        { jitterTown: false },
      );
      if (hit && hit.geo_precision !== 'town'
          && await apply(hit, hit.geo_precision, 'detail_page', jl.venue, jl.street)) { stats.jsonld++; continue; }
    }

    // 2b) per-event iCal LOCATION (GEM2GO/RiS) — full street address, one fetch
    const il = await icsLocation(html, pageUrl, ev.title);
    if (il) {
      if (il.direct && await apply(il.direct, 'venue', 'detail_page', null, il.text)) { stats.ics++; continue; }
      if (il.text && !isSentinelVenue(il.text)) {
        if (/\d{4}/.test(il.text)) {
          // Contains a postcode → a real address string; geocode it directly.
          const hit = await forwardGeocode(il.text, country);
          if (hit && await apply(hit, 'address', 'detail_page', null, il.text)) { stats.ics++; continue; }
        } else {
          // No digits → it's a venue NAME; the POI path (name match + town
          // bound) is stricter and safer than a freeform address lookup.
          const hit = await geocodeEvent({ venue: il.text, town: ev.town, country }, { jitterTown: false });
          if (hit && hit.geo_precision !== 'town'
              && await apply(hit, hit.geo_precision, 'detail_page', il.text, null)) { stats.ics++; continue; }
        }
      }
    }

    // 2c) detail table Ort/Adresse rows
    const tl = tableLocation(html);
    if (tl && (tl.venue ? !isSentinelVenue(tl.venue) : true)) {
      const hit = await geocodeEvent(
        { venue: tl.venue, address: tl.street, town: ev.town, country },
        { jitterTown: false },
      );
      if (hit && hit.geo_precision !== 'town'
          && await apply(hit, hit.geo_precision, 'detail_page', tl.venue, tl.street)) { stats.table++; continue; }
    }

    // 2d) LLM rung (opt-in): the page is fetched but nothing structured matched.
    // The model only reports what the page STATES (strings, never coords);
    // the same geocode + distance guard as every other rung decides.
    if (LLM) {
      const loc = await extractLocationFromText({ text: stripHtml(html), title: ev.title, town: ev.town });
      if (loc && (loc.venue ? !isSentinelVenue(loc.venue) : true)) {
        const hit = await geocodeEvent(
          { venue: loc.venue, address: loc.address, town: ev.town, country },
          { jitterTown: false },
        );
        if (hit && hit.geo_precision !== 'town'
            && await apply(hit, hit.geo_precision, 'llm', loc.venue, loc.address)) { stats.llm++; continue; }
      }
    }

    stats.unresolved++;
  } catch (e) {
    stats.errors++;
    if (stats.errors <= 10) console.log(`! #${ev.id} ${ev.title?.slice(0, 40)}: ${e.code || e.message}`);
  }
}

const resolved = stats.registry + stats.jsonld + stats.ics + stats.table;
console.log(`\n${WRITE ? 'Applied' : 'DRY-RUN would apply'}: ${resolved}/${processed} resolved`
  + ` (registry ${stats.registry}, json-ld ${stats.jsonld}, ical ${stats.ics}, table ${stats.table})`);
console.log(`sentinel ${stats.sentinel}, no-fetchable-detail ${stats.nofetch}, unresolved ${stats.unresolved},`
  + ` distance-guarded ${stats.guarded}, errors ${stats.errors}`);
await sql.end();
await closeDb();
