import Anthropic from '@anthropic-ai/sdk';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

// Haiku for extraction per the design doc (cheap, vision-capable, supports
// structured outputs); override with EXTRACT_MODEL=claude-sonnet-5 for hard cases.
const MODEL = process.env.EXTRACT_MODEL || 'claude-haiku-4-5';

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
      enum: ['family', 'festival', 'market', 'music', 'culture', 'food', 'sport', 'workshop'],
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

function scanPrompt(context) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
  return `Du bist der Extraktions-Schritt einer lokalen Event-Karte für den Raum Linz, Österreich.
Analysiere das Bild (Plakat, Flyer, Einladung oder Screenshot) und extrahiere die Event-Daten.

Regeln:
- Heute ist ${today} (Zeitzone Europe/Vienna). Relative Angaben ("nächsten Samstag") und Daten ohne Jahr auf das nächstliegende ZUKÜNFTIGE Datum auflösen.
- NIEMALS Fakten erfinden. Unbekannte Felder = null. Kein Datum erkennbar → date_start = null.
- description: 1 kurzer deutscher Satz in eigenen Worten (was, für wen).
- confidence: 0–1 je Feld — wie sicher bist du, dass Titel / Datum+Zeit / Ort korrekt gelesen wurden.
- is_event = false, wenn das Bild kein Event ankündigt (dann alle Felder null/leer).${
    context ? `\n- Kontext: Das Foto wurde ungefähr hier aufgenommen: ${context}. Nutze das als Hinweis für den Ort (town).` : ''
  }`;
}

async function callClaudeImage(imageBase64, mediaType, system) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
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

// Fallback when no API credentials are configured: use the locally installed
// `claude` CLI (Claude Code) in headless mode. Slower, but works with the
// user's existing subscription. imagePath must be an absolute path on disk.
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
  const text = envelope.result || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('CLI fallback returned no JSON');
  return JSON.parse(match[0]);
}

export async function extractFromImage({ base64, mediaType, filePath, geoHint }) {
  const system = scanPrompt(geoHint);
  try {
    return await callClaudeImage(base64, mediaType, system);
  } catch (err) {
    const authProblem =
      err instanceof Anthropic.AuthenticationError ||
      /api key|authentication|x-api-key/i.test(String(err?.message));
    if (authProblem && filePath) {
      return await callClaudeCli(filePath, system);
    }
    throw err;
  }
}

// Crawl path: page text → list of events. Text-only, same rules.
export async function extractFromPage({ text, sourceName, town }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(new Date());
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `Du extrahierst Veranstaltungen aus dem Text einer Website (${sourceName}${town ? `, Gemeinde ${town}` : ''}) für eine lokale Event-Karte im Raum Linz.
Heute ist ${today} (Europe/Vienna). Extrahiere NUR zukünftige Events mit erkennbarem Datum (bis ~8 Wochen voraus). Keine Fakten erfinden; unbekannte Felder = null. description: 1 kurzer deutscher Satz in eigenen Worten — nie den Text der Website kopieren. Navigations-Reste, vergangene Events und Nicht-Events ignorieren. Maximal 25 Events.`,
    output_config: { format: { type: 'json_schema', schema: CRAWL_SCHEMA } },
    messages: [{ role: 'user', content: text.slice(0, 60000) }],
  });
  const out = response.content.find((b) => b.type === 'text')?.text || '{"events":[]}';
  return JSON.parse(out).events;
}
