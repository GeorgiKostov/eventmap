import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { extractFromImage } from '../../../lib/extract.js';
import { publishedEvents } from '../../../lib/db.js';
import { findDuplicate } from '../../../lib/dedup.js';
import { limit } from '../../../lib/ratelimit.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// /tmp on serverless (read-only project dir), local data/uploads otherwise.
const UPLOAD_DIR = process.env.VERCEL ? '/tmp/uploads' : path.join(process.cwd(), 'data', 'uploads');
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MESSAGES = {
  de: { globalLimit: 'Das Scan-Limit für heute ist erreicht — bitte morgen wieder.', limit: 'Zu viele Scans — bitte in einer Stunde wieder.', noImage: 'Kein Bild empfangen.', format: 'Dieses Bildformat wird nicht unterstützt.', size: 'Das Bild ist größer als 8 MB.', invalid: 'Die Datei ist kein gültiges Bild.', extraction: 'Die KI-Extraktion ist fehlgeschlagen. Bitte später erneut versuchen.' },
  en: { globalLimit: 'Today’s scan limit has been reached — please try again tomorrow.', limit: 'Too many scans — please try again in an hour.', noImage: 'No image received.', format: 'This image format is not supported.', size: 'The image is larger than 8 MB.', invalid: 'The file is not a valid image.', extraction: 'AI extraction failed. Please try again later.' },
  bg: { globalLimit: 'Днешният лимит за сканиране е достигнат — опитай отново утре.', limit: 'Твърде много сканирания — опитай отново след час.', noImage: 'Не е получено изображение.', format: 'Този формат на изображение не се поддържа.', size: 'Изображението е по-голямо от 8 MB.', invalid: 'Файлът не е валидно изображение.', extraction: 'AI разпознаването беше неуспешно. Опитай отново по-късно.' },
};

// First bytes must match the claimed image type — a MIME header is free to
// fake, magic bytes cost the attacker an actual image file.
function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  return null;
}

export async function POST(req) {
  const messages = MESSAGES[req.headers.get('x-okolo-lang')] || MESSAGES.en;
  // Each scan calls an LLM ($$), so cap it hard: 4/hour + 10/day per IP hash,
  // and a global 100/day circuit-breaker to bound worst-case cost/abuse.
  // POST-LAUNCH (advertised 2026-07-13): cap at 20/hr per IP while monitoring for
  // abuse; was 50/hr during testing, 4/hr originally.
  const rl = await limit(req, 'scan', { perHour: 20, perDay: 200, globalPerDay: 500 });
  if (rl) {
    console.warn(`[intake] scan: rate-limited (scope=${rl.scope} window=${rl.window})`);
    const msg = rl.scope === 'global' ? messages.globalLimit : messages.limit;
    return NextResponse.json({
      error: msg,
      code: 'RATE_LIMITED',
      rateLimit: {
        action: 'ai_intake', scope: rl.scope === 'global' ? 'service' : 'network', window: rl.window,
        ...(rl.scope === 'global' ? {} : { max: rl.max }), perHour: 20, perDay: 200,
      },
    }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }
  const form = await req.formData();
  const file = form.get('image');
  if (!file || typeof file === 'string') {
    console.warn('[intake] scan: no image in request');
    return NextResponse.json({ error: messages.noImage }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    console.warn(`[intake] scan: unsupported type ${file.type}`);
    return NextResponse.json({ error: messages.format }, { status: 415 });
  }
  if (file.size > 8 * 1024 * 1024) {
    console.warn(`[intake] scan: file too large (${file.size}b)`);
    return NextResponse.json({ error: messages.size }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (sniffImage(buf) !== file.type) {
    console.warn(`[intake] scan: content-type mismatch (claimed ${file.type}, sniffed ${sniffImage(buf)})`);
    return NextResponse.json({ error: messages.invalid }, { status: 415 });
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `scan-${Date.now()}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(filePath, buf);

  const lat = parseFloat(form.get('lat')), lng = parseFloat(form.get('lng'));
  const geoHint = Number.isFinite(lat) && Number.isFinite(lng) ? `lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)} (Raum Linz)` : null;

  try {
    const extraction = await extractFromImage({
      base64: buf.toString('base64'),
      mediaType: file.type,
      filePath,
      geoHint,
    });

    // Same-event-twice check #1: a poster scanned for an event we already
    // crawled. Only town-level matching is possible here (no geocode yet —
    // that happens on publish), so this is a best-effort heads-up, not a hard
    // block; the user still confirms before anything is written.
    let duplicate = null;
    if (extraction?.is_event && extraction.title && extraction.date_start) {
      const candidate = {
        title: extraction.title,
        starts_at: `${extraction.date_start}T${/^\d{2}:\d{2}$/.test(extraction.time_start) ? extraction.time_start : '09:00'}`,
        town: extraction.town || null,
      };
      const match = findDuplicate(candidate, await publishedEvents());
      if (match) duplicate = { id: match.id, title: match.title, starts_at: match.starts_at };
    }

    console.log(`[intake] scan: OK is_event=${extraction?.is_event} title=${(extraction?.title || '').slice(0, 60)}${duplicate ? ' (dup of ' + duplicate.id + ')' : ''}`);
    return NextResponse.json({ extraction, photo_path: name, duplicate });
  } catch (err) {
    console.error(`[intake] scan: extraction threw (${err?.message || err})`);
    return NextResponse.json(
      { error: messages.extraction, detail: String(err?.message || err) },
      { status: 502 }
    );
  } finally {
    // No stored waste: the file on disk only exists to feed extraction (and the
    // local `claude` CLI dev fallback, which needs a real path). Never kept after.
    fs.unlink(filePath, () => {});
  }
}
