import { NextResponse } from 'next/server';
import dns from 'dns';
import net from 'net';
import { extractFromImage, extractSingleFromText } from '../../../lib/extract.js';
import { limit } from '../../../lib/ratelimit.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Mirrors /api/scan: same rate-limit buckets (both spend an LLM call in the
// worst case), same X-Okolo-Lang localization, same response envelope
// ({ extraction, source_url } on success, { error } on failure). `fallback:true`
// tells the client to nudge "screenshot it and scan instead" and reopen the
// camera (login-walls, bot-blocks, pages with no readable event).
const MESSAGES = {
  de: { globalLimit: 'Das Limit für heute ist erreicht — bitte morgen wieder.', limit: 'Zu viele Anfragen — bitte in einer Stunde wieder.', noUrl: 'Kein Link angegeben.', badUrl: 'Das sieht nicht nach einem gültigen Link aus.', blocked: 'Diese Seite lässt sich nicht lesen (Login nötig oder geschützt). Mach einen Screenshot und scanne ihn stattdessen.', noEvent: 'Auf dieser Seite wurde kein Event gefunden. Mach einen Screenshot und scanne ihn stattdessen.', failed: 'Der Link konnte nicht geladen werden. Bitte später erneut versuchen.' },
  en: { globalLimit: 'Today’s limit has been reached — please try again tomorrow.', limit: 'Too many requests — please try again in an hour.', noUrl: 'No link provided.', badUrl: 'That doesn’t look like a valid link.', blocked: 'Couldn’t read this page (login required or protected). Screenshot it and scan instead.', noEvent: 'No event found on this page. Screenshot it and scan instead.', failed: 'Could not load the link. Please try again later.' },
  bg: { globalLimit: 'Дневният лимит е достигнат — опитай отново утре.', limit: 'Твърде много заявки — опитай отново след час.', noUrl: 'Не е подаден линк.', badUrl: 'Това не изглежда като валиден линк.', blocked: 'Страницата не може да се прочете (изисква вход или е защитена). Направи екранна снимка и я сканирай.', noEvent: 'На тази страница не е намерено събитие. Направи екранна снимка и я сканирай.', failed: 'Линкът не можа да се зареди. Опитай отново по-късно.' },
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT = 10000;

// Reject anything that isn't a routable public address — the core SSRF guard.
// Covers loopback, RFC1918 private, link-local (incl. IPv6 fe80::/10 and
// IPv4-mapped ::ffff:), unique-local fc00::/7, CGNAT 100.64/10, and the
// unspecified/broadcast edges.
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast + reserved/broadcast
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true;
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4.
    const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return true; // unparseable → refuse
}

async function assertPublicHost(hostname) {
  // IP literals: check directly. Hostnames: resolve EVERY A/AAAA and reject if
  // any resolves private (defeats DNS-rebinding to a single bad record).
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('blocked');
    return;
  }
  const addrs = await dns.promises.lookup(hostname, { all: true });
  if (!addrs.length) throw new Error('blocked');
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error('blocked');
}

// Fetch with a manual redirect loop so every hop is re-validated against the
// SSRF guard (a public URL can 30x to an internal one). http/https only.
async function safeFetch(rawUrl) {
  let current;
  try { current = new URL(rawUrl); } catch { throw new Error('badUrl'); }
  for (let hop = 0; hop < 5; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') throw new Error('badUrl');
    await assertPublicHost(current.hostname);
    let res;
    try {
      res = await fetch(current.href, {
        redirect: 'manual',
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5', 'Accept-Language': 'de,en;q=0.8' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
    } catch { throw new Error('failed'); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      try { current = new URL(res.headers.get('location'), current); } catch { throw new Error('failed'); }
      continue;
    }
    return { res, finalUrl: current.href };
  }
  throw new Error('failed');
}

// Read the body streaming, hard-capped at MAX_BYTES (never trust content-length).
async function readCapped(res) {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await reader.cancel(); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

/* ---------------- JSON-LD / OpenGraph parsing (zero AI cost) ---------------- */
function collectLd(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectLd(n, out); return; }
  if (node && typeof node === 'object') {
    if (node['@graph']) collectLd(node['@graph'], out);
    out.push(node);
  }
}
function parseJsonLd(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { collectLd(JSON.parse(m[1].trim()), out); } catch { /* skip malformed block */ }
  }
  return out;
}
function typeList(node) {
  const t = node['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
}
const isEventType = (node) => typeList(node).some((t) => /Event$/.test(t) || t === 'Event');
const PLACE_TYPES = /^(Place|LocalBusiness|CivicStructure|TouristAttraction|Museum|Park|Zoo|Playground|StadiumOrArena|PerformingArtsTheater|MovieTheater|Aquarium|AmusementPark|Restaurant|Library)$/;
const isPlaceType = (node) => typeList(node).some((t) => PLACE_TYPES.test(t));

// ISO datetime → Vienna wall-clock {date,time}. Offset-bearing timestamps are
// converted to Europe/Vienna (hard rule: stored times are Vienna wall-clock);
// bare local datetimes are taken literally.
function viennaFromIso(iso) {
  if (!iso || typeof iso !== 'string') return { date: null, time: null };
  const hasTz = /[T ]\d{2}:\d{2}(?::\d{2})?\s*(Z|[+-]\d{2}:?\d{2})$/.test(iso.trim());
  if (hasTz) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: null, time: null };
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Vienna', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const g = (t) => parts.find((p) => p.type === t).value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
  }
  const m = iso.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return { date: null, time: null };
  return { date: m[1], time: m[2] ? `${m[2]}:${m[3]}` : null };
}
function flattenAddress(addr) {
  if (!addr) return { address: null, town: null };
  if (typeof addr === 'string') return { address: addr, town: null };
  const street = [addr.streetAddress].filter(Boolean).join(' ');
  return { address: street || null, town: addr.addressLocality || addr.addressRegion || null };
}
function firstString(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === 'object' && typeof v.name === 'string') return v.name;
  return null;
}

// Build the SCAN_SCHEMA-shaped extraction (same object the poster scan returns)
// from a JSON-LD node. Descriptions are NEVER copied from the page (doctrine) —
// left empty for the user to write their own.
function extractionFromLd(node) {
  const place = isPlaceType(node) && !isEventType(node);
  const title = firstString(node.name);
  if (place) {
    const loc = flattenAddress(node.address);
    return {
      is_event: false, kind: 'place', title: title || '',
      date_start: null, time_start: null, date_end: null, time_end: null,
      venue: title || null, address: loc.address, town: loc.town,
      categories: [], is_free: null, age_min: null, age_max: null, indoor: null,
      description: '', confidence: { title: title ? 0.9 : 0.2, datetime: 0, location: loc.town || loc.address ? 0.8 : 0.3 },
    };
  }
  const start = viennaFromIso(node.startDate);
  const end = viennaFromIso(node.endDate);
  const locName = firstString(node.location);
  const loc = flattenAddress(node.location && typeof node.location === 'object' ? node.location.address : null);
  return {
    is_event: true, kind: 'event', title: title || '',
    date_start: start.date, time_start: start.time, date_end: end.date, time_end: end.time,
    venue: locName, address: loc.address, town: loc.town,
    categories: [], is_free: null, age_min: null, age_max: null, indoor: null,
    description: '',
    confidence: { title: title ? 0.9 : 0.2, datetime: start.date ? 0.9 : 0.2, location: locName || loc.town ? 0.8 : 0.3 },
  };
}

// Strip a full HTML doc to readable text for the AI fallback: drop
// script/style/noscript/nav/header/footer/svg, then tags → whitespace.
function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|header|footer|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? m[1] : null;
}

export async function POST(req) {
  const messages = MESSAGES[req.headers.get('x-okolo-lang')] || MESSAGES.en;
  const rl = await limit(req, 'scan', { perHour: 4, perDay: 10, globalPerDay: 100 });
  if (rl) {
    const msg = rl.scope === 'global' ? messages.globalLimit : messages.limit;
    return NextResponse.json({ error: msg }, { status: 429 });
  }

  let url;
  try { url = (await req.json())?.url; } catch { url = null; }
  if (!url || typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: messages.noUrl }, { status: 400 });
  }

  let res, finalUrl;
  try {
    ({ res, finalUrl } = await safeFetch(url.trim()));
  } catch (err) {
    const code = err?.message;
    if (code === 'badUrl') return NextResponse.json({ error: messages.badUrl }, { status: 400 });
    if (code === 'blocked') return NextResponse.json({ error: messages.blocked, fallback: true }, { status: 422 });
    return NextResponse.json({ error: messages.failed, fallback: true }, { status: 502 });
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();

  // Image URL → run the poster-scan path on the bytes.
  if (contentType.startsWith('image/')) {
    const buf = await readCapped(res);
    if (!buf.length) return NextResponse.json({ error: messages.failed, fallback: true }, { status: 502 });
    const mediaType = contentType.split(';')[0].trim();
    try {
      const extraction = await extractFromImage({ base64: buf.toString('base64'), mediaType, geoHint: null });
      if (!extraction?.is_event) return NextResponse.json({ error: messages.noEvent, fallback: true }, { status: 422 });
      return NextResponse.json({ extraction: { ...extraction, kind: 'event' }, source_url: finalUrl });
    } catch (err) {
      console.error('extract-url image path failed:', err?.message);
      return NextResponse.json({ error: messages.failed, fallback: true }, { status: 502 });
    }
  }

  if (!res.ok) {
    return NextResponse.json({ error: messages.blocked, fallback: true }, { status: 422 });
  }

  const html = (await readCapped(res)).toString('utf-8');

  // 1. JSON-LD schema.org Event / Place — exact fields, zero AI cost.
  const nodes = parseJsonLd(html);
  const ldEvent = nodes.find(isEventType) || nodes.find(isPlaceType);
  if (ldEvent) {
    const extraction = extractionFromLd(ldEvent);
    // 2. OpenGraph title fill-in when JSON-LD omitted the name.
    if (!extraction.title) extraction.title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || '';
    if (extraction.title && (extraction.kind === 'place' || extraction.date_start)) {
      return NextResponse.json({ extraction, source_url: finalUrl });
    }
  }

  // 3. AI fallback: stripped page text → one structured event.
  const ogTitle = metaContent(html, 'og:title') || metaContent(html, 'twitter:title');
  const text = [ogTitle, htmlToText(html)].filter(Boolean).join('\n\n').slice(0, 60000);
  if (text.length < 40) {
    return NextResponse.json({ error: messages.blocked, fallback: true }, { status: 422 });
  }
  try {
    const extraction = await extractSingleFromText({ text, contextUrl: finalUrl });
    if (!extraction?.is_event || !extraction.title || !extraction.date_start) {
      return NextResponse.json({ error: messages.noEvent, fallback: true }, { status: 422 });
    }
    return NextResponse.json({ extraction: { ...extraction, kind: 'event' }, source_url: finalUrl });
  } catch (err) {
    console.error('extract-url text path failed:', err?.message);
    return NextResponse.json({ error: messages.failed, fallback: true }, { status: 502 });
  }
}
