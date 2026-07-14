import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execFileP = promisify(execFile);

// Provider routing lives HERE, not in feature code (hard rule). Order by the
// scan-model decision (docs/decisions/2026-07-10-scan-model-choice.md):
//   1. Gemini Flash-Lite — cheapest per-image, strong German OCR, JSON mode. Primary.
//   2. Claude Haiku — quality/instruction-following. Fallback for hard posters / no Gemini key.
//   3. Local `claude` CLI — dev convenience when no API key is configured.
const CLAUDE_MODEL = process.env.EXTRACT_MODEL || 'claude-haiku-4-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

const EVENT_PROPS = {
  title: { type: ['string', 'null'] },
  date_start: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
  time_start: { type: ['string', 'null'], description: 'HH:MM, 24h, or null if unknown' },
  date_end: { type: ['string', 'null'] },
  time_end: { type: ['string', 'null'] },
  venue: { type: ['string', 'null'] },
  address: { type: ['string', 'null'] },
  town: { type: ['string', 'null'] },
  categories: {
    type: 'array',
    items: {
      type: 'string',
      enum: ['family', 'festival', 'market', 'music', 'party', 'culture', 'food', 'sport', 'workshop'],
    },
  },
  is_free: { type: ['boolean', 'null'] },
  age_min: { type: ['integer', 'null'] },
  age_max: { type: ['integer', 'null'] },
  indoor: { type: ['boolean', 'null'] },
  description: { type: ['string', 'null'], description: '1 short German sentence, own words' },
};

const SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_event', 'title', 'date_start', 'time_start', 'date_end', 'time_end',
    'venue', 'address', 'town', 'categories', 'is_free', 'age_min', 'age_max',
    'indoor', 'description', 'confidence',
  ],
  properties: {
    is_event: { type: 'boolean', description: 'false if the image is not an event poster/flyer/invitation' },
    ...EVENT_PROPS,
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'datetime', 'location'],
      properties: {
        title: { type: 'number' },
        datetime: { type: 'number' },
        location: { type: 'number' },
      },
    },
  },
};

const CRAWL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: Object.keys(EVENT_PROPS),
        properties: EVENT_PROPS,
      },
    },
  },
};

// Category disambiguation shared by every prompt — "party" is easy to confuse
// with music/festival, so pin down that it means nightlife/dance, not concerts.
const PARTY_HINT = 'Kategorie "party" = Nightlife / Tanzveranstaltung (Rave, Clubbing, DJ-Set, Disco, Clubnacht, Ball/Tanznacht, Ü30-Party, Après-Ski-Party) — NICHT Konzerte (das ist music) und NICHT Familien-/Ortsfeste (das ist festival).';

function scanPrompt(context) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
  return `Du bist der Extraktions-Schritt einer lokalen Event-Karte für den Raum Linz, Österreich.
Analysiere das Bild (Plakat, Flyer, Einladung oder Screenshot) und extrahiere die Event-Daten.

Regeln:
- Heute ist ${today} (Zeitzone Europe/Vienna). Relative Angaben ("nächsten Samstag") und Daten ohne Jahr auf das nächstliegende ZUKÜNFTIGE Datum auflösen.
- NIEMALS Fakten erfinden — was nicht lesbar ist, bleibt null. Aber leere NIEMALS ein Feld, das du tatsächlich lesen konntest. Kein Datum erkennbar → date_start = null.
- Gib IMMER jedes Feld zurück, das du entziffern kannst — auch bei schlechter Bildqualität, verwackelt, teils verdeckt oder niedriger Confidence. Ein teilweise gelesenes Event, das der Nutzer fertig ausfüllt, ist besser als ein leeres Formular. Rate lieber ein plausibles Feld (mit niedriger confidence) als es wegzulassen — nur bei echt Unlesbarem null.
- description: 1 kurzer deutscher Satz in eigenen Worten (was, für wen).
- confidence: 0–1 je Feld — wie sicher bist du, dass Titel / Datum+Zeit / Ort korrekt gelesen wurden. Bei Rateanteil niedrig setzen.
- is_event: Sei großzügig. Sobald der Text plausibel ein Event beschreibt — ein Titel plus (Datum/Zeit ODER ein Ort/Veranstaltungsort) — ist is_event = true, auch bei mieser Qualität oder Lücken. Bei Unsicherheit → true. is_event = false NUR, wenn das Bild klar kein Event ist (Landschaft, Produktfoto, Selfie, Meme, reiner Text ohne Event-Bezug). Auch bei is_event = false: gib trotzdem jedes lesbare Feld zurück, leere nichts.
- ${PARTY_HINT}
- Sprache/Schrift: Text-Felder (title, venue, address, town, description) IMMER in der Sprache und Schrift der Quelle wiedergeben — niemals übersetzen oder transliterieren (z.B. bulgarischer Text bleibt in kyrillischer Schrift). Datumsangaben in jedem lokalen Format erkennen (z.B. "Tag.Monat.Jahr" mit landessprachigen Monatsnamen) und in das geforderte date_start/date_end (YYYY-MM-DD) auflösen.${
    context ? `\n- Kontext: Das Foto wurde ungefähr hier aufgenommen: ${context}. Nutze das als Hinweis für den Ort (town).` : ''
  }`;
}

// Robust JSON parse — accepts a bare object or one wrapped in prose/fences.
function parseJson(text) {
  const t = (text || '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Extraction returned no JSON');
  return JSON.parse(m[0]);
}

// Single-event JSON key hint (SCAN_SCHEMA shape) — shared by the poster-image
// and the submitted-link text callers so providers without native schema
// enforcement still emit the exact keys.
const SCAN_KEY_HINT = `\n\nAntworte NUR mit einem JSON-Objekt mit genau diesen Schlüsseln: ${SCAN_SCHEMA.required.join(', ')}. "categories" ist ein Array aus [family, festival, market, music, party, culture, food, sport, workshop]. "confidence" ist ein Objekt mit den Zahlen title, datetime, location (je 0–1).`;

// --- Gemini (primary) ---
function geminiAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

async function callGeminiImage(base64, mediaType, system) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: mediaType, data: base64 } },
      { text: 'Extrahiere die Event-Daten aus diesem Bild.' },
    ] }],
    config: { systemInstruction: system + SCAN_KEY_HINT, responseMimeType: 'application/json', temperature: 0 },
  });
  return parseJson(res.text);
}

// Single submitted page → one structured event (SCAN_SCHEMA shape), text-only.
async function callGeminiTextSingle(pageText, system) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: pageText.slice(0, 60000) }] }],
    config: { systemInstruction: system + SCAN_KEY_HINT, responseMimeType: 'application/json', temperature: 0 },
  });
  return parseJson(res.text);
}

// Providers without native schema enforcement free-form field names
// (date/location instead of date_start/venue/...), which silently drops every
// event downstream (crawl.mjs reads exact keys) — so every text caller gets
// the explicit key list appended to its system prompt.
const TEXT_KEY_HINT = `\n\nAntworte NUR mit einem JSON-Objekt der Form {"events": [...]}. Jedes Event-Objekt hat GENAU diese Schlüssel: ${Object.keys(EVENT_PROPS).join(', ')}. "categories" ist ein Array aus [family, festival, market, music, party, culture, food, sport, workshop]. Unbekannte Felder = null (nicht weglassen).`;

async function callGeminiText(pageText, system) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  // Gemini text calls only get responseMimeType, not a responseSchema (the
  // CRAWL_SCHEMA dialect—type:['string','null']—is Claude's json_schema
  // format, not Gemini's OpenAPI-subset).
  const keyHint = TEXT_KEY_HINT;
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: pageText.slice(0, 60000) }] }],
    config: {
      systemInstruction: system + keyHint,
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });
  return parseJson(res.text).events || [];
}

// --- Grok / xAI (optional bulk-backfill provider; needs XAI_API_KEY) ---
// OpenAI-compatible endpoint. Used for one-time large fills (e.g. Austria-wide
// backfill on promo/free API credits); steady-state stays on Gemini. A chat
// subscription is NOT API access — this only activates with a real console.x.ai key.
const XAI_MODEL = process.env.XAI_MODEL || 'grok-4-fast-non-reasoning';

function grokAvailable() {
  return !!process.env.XAI_API_KEY;
}

async function callGrokText(pageText, system) {
  const keyHint = TEXT_KEY_HINT;
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: XAI_MODEL,
      messages: [
        { role: 'system', content: system + keyHint },
        { role: 'user', content: pageText.slice(0, 60000) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`xAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return parseJson(data.choices?.[0]?.message?.content || '').events || [];
}

// --- Ollama (optional local-LLM provider; EXTRACT_PROVIDER=ollama) ---
// For the local crawl box (docs/ops/local-box-setup.md): a 7–14B model on the
// box's own hardware handles the LLM-fallback leftovers at $0 with no rate
// limits and no data leaving the machine. Native /api/chat with format:'json';
// falls through to Gemini→Claude on any failure, so a stopped Ollama never
// breaks a crawl. OLLAMA_URL default matches Ollama's standard port.
const OLLAMA_BASE = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b';

async function callOllamaText(pageText, system) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: system + TEXT_KEY_HINT },
        { role: 'user', content: pageText.slice(0, 60000) },
      ],
      format: 'json',
      stream: false,
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(180000), // local inference is slow; a nightly crawl doesn't care
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return parseJson(data.message?.content || '').events || [];
}

// Venue address lookup via WEB SEARCH (scripts/venue-search.mjs — the last rung
// of the enrichment ladder, docs/design/big-city-quality.md §1 Stage 3). Used
// only for venues no source page states an address for, so the open web is the
// only remaining evidence. Grok CLI: subscription tokens ($0), and unlike the
// extraction path it is deliberately allowed to search — hence --max-turns 5
// (one turn cannot both search and answer) instead of the hard 1-turn fence.
// cwd stays pinned to a temp dir so it can't wander the repo.
//
// CRITICAL (hard rule 5): this returns an address STRING, never coordinates.
// The caller geocodes it through our own Nominatim path and distance-bounds the
// result; a venue the model invents simply fails to geocode and the event stays
// honestly at town precision. Never trust a model for a position.
export async function searchVenueAddress({ venue, town, country = 'AT' }) {
  const where = { AT: 'Österreich', BG: 'България', DE: 'Deutschland' }[country] || 'Österreich';
  const prompt = `Search the web for the street address of the event venue "${venue}"${town ? ` in ${town}` : ''}, ${where}.
Reply with ONLY a JSON object and no other text: {"address": "Straße Hausnummer, PLZ Ort"} — the venue's real postal address as published by an official/local source.
If you cannot find a confident address for THIS venue in THIS town, reply exactly {"address": null}. Never guess, never invent a street. Do not explain — JSON only.`;

  // The CLI exits non-zero on transient agent/tool errors (and does so more
  // often under parallel invocations), so one retry converts most of them into
  // answers. A model that replies in PROSE instead of JSON is not an error at
  // all — it is the model saying "I couldn't find it" in words, so that maps to
  // null (not-found), never to a guessed address.
  const run = async () => {
    const { stdout } = await execFileP(
      'grok',
      ['-p', prompt, '--output-format', 'json', '--max-turns', '5', '--cwd', os.tmpdir()],
      { timeout: 240000, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, PATH: `${process.env.HOME}/.grok/bin:${process.env.PATH}` } },
    );
    return stdout;
  };
  let stdout;
  try {
    stdout = await run();
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
    try { stdout = await run(); } catch { return null; } // twice-failed CLI → not found, not a crash
  }

  let envelope;
  try { envelope = JSON.parse(stdout); } catch { return null; }
  let out = envelope.structuredOutput;
  if (!out) {
    try { out = parseJson(envelope.text || ''); } catch { return null; } // prose answer = "not found"
  }
  const addr = out?.address;
  if (typeof addr !== 'string' || !addr.trim() || addr.trim().toLowerCase() === 'null') return null;
  return addr.trim();
}

// Grok CLI (~/.grok/bin/grok on PATH): subscription tokens, no API key/cost —
// George's preferred bulk-backfill path. Fenced hard: single turn, no tools, no
// web search, cwd pinned to a temp dir (unfenced it agent-wanders the repo
// looking for "missing input"). stdin is NOT delivered in -p mode — the page
// text must be embedded in the prompt. Envelope: {text, structuredOutput, ...};
// structuredOutput is null whenever the model adds prose/fences, so fall back
// to parseJson(text). Slower per page than the APIs (agent startup) — fine for
// batch backfills, wrong for anything latency-sensitive.
async function callGrokCliText(pageText, system) {
  const prompt = `${system}${TEXT_KEY_HINT}\n\nTEXT:\n${pageText.slice(0, 60000)}`;
  const { stdout } = await execFileP(
    'grok',
    ['-p', prompt, '--output-format', 'json', '--json-schema', JSON.stringify(CRAWL_SCHEMA),
     '--tools', '', '--disable-web-search', '--max-turns', '1', '--cwd', os.tmpdir()],
    { timeout: 240000, maxBuffer: 8 * 1024 * 1024 }
  );
  const envelope = JSON.parse(stdout);
  const out = envelope.structuredOutput || parseJson(envelope.text || '');
  return out.events || [];
}

// --- Claude (fallback) ---
async function callClaudeImage(imageBase64, mediaType, system) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system,
    output_config: { format: { type: 'json_schema', schema: SCAN_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'Extrahiere die Event-Daten aus diesem Bild.' },
        ],
      },
    ],
  });
  const text = response.content.find((b) => b.type === 'text')?.text || '{}';
  return JSON.parse(text);
}

async function callClaudeText(pageText, system) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system,
    output_config: { format: { type: 'json_schema', schema: CRAWL_SCHEMA } },
    messages: [{ role: 'user', content: pageText.slice(0, 60000) }],
  });
  const out = response.content.find((b) => b.type === 'text')?.text || '{"events":[]}';
  return JSON.parse(out).events;
}

async function callClaudeTextSingle(pageText, system) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system,
    output_config: { format: { type: 'json_schema', schema: SCAN_SCHEMA } },
    messages: [{ role: 'user', content: pageText.slice(0, 60000) }],
  });
  const text = response.content.find((b) => b.type === 'text')?.text || '{}';
  return JSON.parse(text);
}

// Last resort when no API credentials are configured: the locally installed
// `claude` CLI (Claude Code) in headless mode. imagePath must be absolute.
async function callClaudeCli(imagePath, system) {
  const prompt = `${system}

Read the image file at ${imagePath} and respond with ONLY a JSON object matching this schema (no markdown fences):
${JSON.stringify(SCAN_SCHEMA.properties, null, 0)}
Required keys: ${SCAN_SCHEMA.required.join(', ')}`;
  const { stdout } = await execFileP(
    'claude',
    ['-p', prompt, '--output-format', 'json', '--allowedTools', 'Read', '--max-turns', '4'],
    { timeout: 180000, maxBuffer: 4 * 1024 * 1024 }
  );
  const envelope = JSON.parse(stdout);
  return parseJson(envelope.result || '');
}

function isAuthProblem(err) {
  return (
    err instanceof Anthropic.AuthenticationError ||
    /api key|authentication|x-api-key/i.test(String(err?.message))
  );
}

// A first user tap (poster scan / link submit) commonly lands on a cold
// serverless container: the model call can transiently 429/5xx/overload or the
// socket can stall, then the retry (the user's second tap) sails through. This
// absorbs that first-attempt flake in-process so the first tap just works.
// Retries ONLY transient failures — an auth error or a bad-content error is
// deterministic and rethrown immediately, never looped.
function isTransient(err) {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (status && [408, 409, 425, 429, 500, 502, 503, 504, 529].includes(status)) return true;
  return /overload|rate.?limit|timeout|timed ?out|econnreset|econnrefused|etimedout|enotfound|socket hang up|network|fetch failed|\b(502|503|504|529)\b/i.test(
    String(err?.message || err),
  );
}

async function withRetry(fn, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !isTransient(err)) {
        if (isTransient(err)) console.warn(`[intake] extract: gave up after ${attempts} transient failures — ${err?.message}`);
        throw err;
      }
      console.warn(`[intake] extract: transient failure (attempt ${i + 1}/${attempts}), retrying — ${err?.message}`);
      await new Promise((r) => setTimeout(r, 400 * (i + 1))); // 400ms, then 800ms
    }
  }
  throw lastErr;
}

// Poster scan: image → structured event. Gemini primary, Claude fallback, CLI last.
export async function extractFromImage({ base64, mediaType, filePath, geoHint }) {
  const system = scanPrompt(geoHint);

  return withRetry(async () => {
    if (geminiAvailable()) {
      try {
        return await callGeminiImage(base64, mediaType, system);
      } catch (err) {
        console.error('Gemini image extraction failed, falling back to Claude:', err?.message);
      }
    }

    try {
      return await callClaudeImage(base64, mediaType, system);
    } catch (err) {
      if (isAuthProblem(err) && filePath) return await callClaudeCli(filePath, system);
      throw err;
    }
  });
}

// Crawl path: page text → list of events. Text-only, same rules and providers.
export async function extractFromPage({ text, sourceName, town }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
  const system = `Du extrahierst Veranstaltungen aus dem Text einer Website (${sourceName}${town ? `, Gemeinde ${town}` : ''}) für eine lokale Event-Karte im Raum Linz.
Heute ist ${today} (Europe/Vienna). Extrahiere NUR zukünftige Events mit erkennbarem Datum (bis ~8 Wochen voraus). Keine Fakten erfinden; unbekannte Felder = null. description: 1 kurzer Satz in eigenen Worten, in der Sprache der Quelle — nie den Text der Website kopieren. Navigations-Reste, vergangene Events und Nicht-Events ignorieren. Maximal 25 Events.
${PARTY_HINT}
Sprache/Schrift: Text-Felder (title, venue, address, town, description) IMMER in der Sprache und Schrift der Quelle wiedergeben — niemals übersetzen oder transliterieren (z.B. bulgarischer Text bleibt in kyrillischer Schrift, nie in lateinische Buchstaben umschreiben). Datumsangaben in jedem lokalen Format erkennen (z.B. "Tag.Monat.Jahr" mit landessprachigen Monatsnamen, kyrillischen Monatsnamen für bulgarische Quellen) und in date_start/date_end (YYYY-MM-DD) auflösen — Zeit als lokale Wanduhrzeit der Quelle, keine UTC-Umrechnung.`;

  // EXTRACT_PROVIDER=grok opts a run into Grok for bulk backfills: the local
  // Grok CLI first (subscription tokens — George's call: save tokens, not the
  // xAI API), the API only if a key is set and the CLI fails/missing. Default
  // order without the env stays Gemini → Claude.
  if (process.env.EXTRACT_PROVIDER === 'grok') {
    try {
      return await callGrokCliText(text, system);
    } catch (err) {
      console.error('Grok CLI extraction failed, falling back:', err?.message);
    }
    if (grokAvailable()) {
      try {
        return await callGrokText(text, system);
      } catch (err) {
        console.error('Grok API extraction failed, falling back:', err?.message);
      }
    }
  }
  // EXTRACT_PROVIDER=ollama routes the fallback through a local model on the
  // crawl box; any failure (Ollama down, model missing) falls through to the
  // normal Gemini→Claude order so the crawl never depends on it.
  if (process.env.EXTRACT_PROVIDER === 'ollama') {
    try {
      return await callOllamaText(text, system);
    } catch (err) {
      console.error('Ollama extraction failed, falling back:', err?.message);
    }
  }
  if (geminiAvailable()) {
    try {
      return await callGeminiText(text, system);
    } catch (err) {
      console.error('Gemini text extraction failed, falling back to Claude:', err?.message);
    }
  }
  return await callClaudeText(text, system);
}

// Location-only extraction for the enrichment ladder's LLM rung
// (scripts/enrich-locations.mjs --llm): given the stripped text of an event's
// own detail page, return WHERE the named event takes place — venue/address
// strings exactly as the page states them, or nulls. The caller geocodes and
// distance-bounds the result; this function never returns coordinates, and the
// prompt forbids inference (hard rule 5: a page that doesn't state a location
// yields nulls, not a guess). Gemini primary, Claude fallback.
export async function extractLocationFromText({ text, title, town }) {
  const system = `Du liest den Text einer Veranstaltungs-Detailseite. Aufgabe: Finde heraus, WO die Veranstaltung "${title}"${town ? ` (Gemeinde ${town})` : ''} stattfindet.
Antworte NUR mit JSON: {"venue": "...", "address": "..."} — venue = Name des Veranstaltungsorts (z.B. "Pfarrsaal St. Martin"), address = Straße + Hausnummer (+ PLZ/Ort wenn angegeben), jeweils WÖRTLICH wie im Text. Felder, die der Text nicht nennt, sind null. Wenn der Text keinen Ort für diese Veranstaltung nennt: {"venue": null, "address": null}. NIEMALS raten oder aus dem Kontext erschließen.`;
  const LOCATION_SCHEMA = {
    type: 'object',
    properties: {
      venue: { type: ['string', 'null'] },
      address: { type: ['string', 'null'] },
    },
    required: ['venue', 'address'],
  };
  let out = null;
  if (geminiAvailable()) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: text.slice(0, 40000) }] }],
        config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0 },
      });
      out = parseJson(res.text);
    } catch (err) {
      console.error('Gemini location extraction failed, falling back to Claude:', err?.message);
    }
  }
  if (!out) {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system,
      output_config: { format: { type: 'json_schema', schema: LOCATION_SCHEMA } },
      messages: [{ role: 'user', content: text.slice(0, 40000) }],
    });
    out = JSON.parse(response.content.find((b) => b.type === 'text')?.text || '{}');
  }
  const clean = (v) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);
  const venue = clean(out?.venue);
  const address = clean(out?.address);
  return venue || address ? { venue, address } : null;
}

// Link-submission path: the stripped text of ONE user-submitted page (a
// Facebook event, a ticket/venue page…) → a single structured event
// (SCAN_SCHEMA shape, same as a poster scan, so the confirm screen treats both
// identically). Cheaper JSON-LD/OpenGraph parsing happens in the route first;
// this is the AI fallback for pages without machine-readable event markup.
// Gemini primary, Claude fallback (no CLI path — text has no local file).
export async function extractSingleFromText({ text, contextUrl }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
  const system = `Du bist der Extraktions-Schritt einer lokalen Event-Karte für den Raum Linz, Österreich.
Der Nutzer hat den Link einer einzelnen Webseite eingereicht (z.B. Facebook-Event, Ticket- oder Veranstaltungsseite${contextUrl ? `; Quelle: ${contextUrl}` : ''}). Extrahiere daraus das EINE beworbene Event.

Regeln:
- Heute ist ${today} (Zeitzone Europe/Vienna). Relative oder jahrlose Datumsangaben auf das nächstliegende ZUKÜNFTIGE Datum auflösen (bis ~1 Jahr voraus).
- NIEMALS Fakten erfinden. Unbekannte Felder = null. Kein verlässliches Datum erkennbar → date_start = null.
- description: 1 kurzer Satz in EIGENEN Worten (was, für wen) — niemals den Text der Seite kopieren.
- ${PARTY_HINT}
- confidence: 0–1 je Feld — wie sicher Titel / Datum+Zeit / Ort korrekt sind.
- is_event = false, wenn die Seite kein konkretes Event ankündigt (Login-Wand, Fehlerseite, reine Übersichtsseite) — dann alle Felder null/leer.
- Zeit als lokale Wanduhrzeit der Quelle, keine UTC-Umrechnung. Text-Felder in der Sprache/Schrift der Quelle belassen, nie übersetzen oder transliterieren.`;

  return withRetry(async () => {
    if (geminiAvailable()) {
      try {
        return await callGeminiTextSingle(text, system);
      } catch (err) {
        console.error('Gemini link extraction failed, falling back to Claude:', err?.message);
      }
    }
    return await callClaudeTextSingle(text, system);
  });
}

// --- weekly digest copy (newsletter subject/intro + one teaser per pick) ---
// This is the one place in the pipeline where the model WRITES rather than
// extracts, so it gets the stronger model (Sonnet, not the Flash-Lite/Haiku
// extraction tier — George's call). Still routed here, never in the feature
// code (hard rule 2), and still fact-bound: the model may only rephrase the
// facts it is handed and must not add a time, price, age or venue (hard rule
// 5). If no provider is configured, lib/digest.js falls back to a deterministic
// template — the newsletter must never depend on an AI call succeeding.
const COPY_MODEL = process.env.COPY_MODEL || 'claude-sonnet-5';

const DIGEST_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    intro: { type: 'string' },
    teasers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, line: { type: 'string' } },
        required: ['id', 'line'],
        additionalProperties: false,
      },
    },
  },
  required: ['subject', 'intro', 'teasers'],
  additionalProperties: false,
};

const DIGEST_LANG = {
  de: { name: 'Deutsch (Österreich, Du-Form)', ex: 'z.B. "Diese Woche wird’s bunt rund um Linz"' },
  bg: { name: 'български (на „ти“)', ex: 'напр. „Този уикенд в София има какво да се прави“' },
  en: { name: 'English (warm, informal)', ex: 'e.g. "A busy weekend around Linz"' },
};

function digestPrompt({ city, lang, weekendLabel }) {
  const l = DIGEST_LANG[lang] || DIGEST_LANG.en;
  return `Du schreibst den wöchentlichen Familien-Newsletter von Okolo (okolo.events) — eine Event-Karte für Familien. Ausgabe für ${city}, Wochenende ${weekendLabel}.

SPRACHE: Schreibe ALLES in ${l.name}. Kein Wort in einer anderen Sprache (${l.ex}).

TON: ein hilfreicher lokaler Nachbar, der kurz sagt, was los ist. Warm, konkret, ohne Marketing-Floskeln, ohne Ausrufezeichen-Feuerwerk, ohne Emojis in subject/intro.

DU BEKOMMST eine Liste echter Events mit ihren Fakten (Titel, Tag/Zeit, Ort, gratis?, Alter, drinnen/draußen, unsere eigene Kurzbeschreibung).

HARTE REGELN:
- Erfinde NICHTS. Nutze ausschließlich die übergebenen Fakten. Keine erfundene Uhrzeit, kein erfundener Preis, kein erfundenes Alter, kein erfundener Programmpunkt, keine Superlative über Dinge, die nicht in den Fakten stehen.
- Steht ein Feld nicht in den Fakten, erwähne es nicht.
- Formuliere in EIGENEN Worten. Kopiere keine Beschreibung wörtlich.

LIEFERE:
- subject: Betreffzeile der E-Mail, max. 60 Zeichen, nennt Stadt und Wochenende.
- intro: 1–2 Sätze Einleitung über das Wochenende insgesamt (max. 240 Zeichen).
- teasers: für JEDES übergebene Event genau ein Objekt {id, line}. "id" exakt die übergebene ID. "line" = EIN Satz (max. 110 Zeichen), der neugierig macht und nur auf den Fakten beruht. Datum/Ort NICHT wiederholen — die stehen schon daneben.`;
}

async function callClaudeDigest(system, payload) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: COPY_MODEL,
    max_tokens: 2000,
    system,
    output_config: { format: { type: 'json_schema', schema: DIGEST_SCHEMA } },
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });
  return JSON.parse(res.content.find((b) => b.type === 'text')?.text || '{}');
}

async function callGeminiDigest(system, payload) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: process.env.COPY_GEMINI_MODEL || 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
    config: {
      systemInstruction: `${system}\n\nAntworte NUR mit JSON: {"subject": "...", "intro": "...", "teasers": [{"id": "...", "line": "..."}]}`,
      responseMimeType: 'application/json',
      temperature: 0.6,
    },
  });
  return parseJson(res.text);
}

// events: [{ id, title, when, venue, town, is_free, age, indoor, description }]
// Returns { subject, intro, teasers, model } — `model` names the provider that
// ACTUALLY wrote the copy, never the one we hoped would. Without it a missing
// ANTHROPIC_API_KEY degrades silently to the cheaper writer and the dashboard
// still claims "Sonnet", which is precisely the misconfiguration worth seeing.
// Returns null when no provider is available (→ template fallback).
export async function writeDigestCopy({ city, lang, weekendLabel: label, events }) {
  const system = digestPrompt({ city, lang, weekendLabel: label });
  const payload = { events };
  try {
    return await withRetry(async () => {
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          return { ...(await callClaudeDigest(system, payload)), model: COPY_MODEL };
        } catch (err) {
          console.error('[digest] Claude copy failed, falling back to Gemini:', err?.message);
        }
      }
      if (geminiAvailable()) {
        const gemModel = process.env.COPY_GEMINI_MODEL || 'gemini-2.5-flash';
        return { ...(await callGeminiDigest(system, payload)), model: gemModel };
      }
      return null;
    });
  } catch (err) {
    console.error('[digest] copy generation failed, using template fallback:', err?.message);
    return null;
  }
}
