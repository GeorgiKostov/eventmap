import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { extractFromImage } from '../../../lib/extract.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// /tmp on serverless (read-only project dir), local data/uploads otherwise.
const UPLOAD_DIR = process.env.VERCEL ? '/tmp/uploads' : path.join(process.cwd(), 'data', 'uploads');
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function POST(req) {
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
    return NextResponse.json({ extraction, photo_path: name });
  } catch (err) {
    console.error('scan extraction failed:', err);
    return NextResponse.json(
      { error: 'KI-Extraktion fehlgeschlagen. Ist ein Claude-API-Key konfiguriert (.env.local) oder Claude Code installiert?', detail: String(err?.message || err) },
      { status: 502 }
    );
  }
}
