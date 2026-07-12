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
  // Each scan calls an LLM ($$), so cap it hard: 4/hour + 10/day per IP hash,
  // and a global 100/day circuit-breaker to bound worst-case cost/abuse.
  const rl = await limit(req, 'scan', { perHour: 4, perDay: 10, globalPerDay: 100 });
  if (rl) {
    const msg = rl.scope === 'global'
      ? 'Das Scan-Limit für heute ist erreicht — bitte morgen wieder.'
      : 'Zu viele Scans — bitte in einer Stunde wieder.';
    return NextResponse.json({ error: msg }, { status: 429 });
  }
  const form = await req.formData();
  const file = form.get('image');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Kein Bild empfangen.' }, { status: 400 });
  }
  const ext = ALLOWED[file.type];
  if (!ext) return NextResponse.json({ error: `Bildformat ${file.type} nicht unterstützt.` }, { status: 415 });
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Bild größer als 8 MB.' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (sniffImage(buf) !== file.type) {
    return NextResponse.json({ error: 'Datei ist kein gültiges Bild.' }, { status: 415 });
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

    return NextResponse.json({ extraction, photo_path: name, duplicate });
  } catch (err) {
    console.error('scan extraction failed:', err);
    return NextResponse.json(
      { error: 'KI-Extraktion fehlgeschlagen. Ist ein Claude-API-Key konfiguriert (.env.local) oder Claude Code installiert?', detail: String(err?.message || err) },
      { status: 502 }
    );
  } finally {
    // No stored waste: the file on disk only exists to feed extraction (and the
    // local `claude` CLI dev fallback, which needs a real path). Never kept after.
    fs.unlink(filePath, () => {});
  }
}
