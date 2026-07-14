// Text embedding, provider-routed like lib/extract.js (hard rule 2 — no
// provider calls scattered in feature code). Gemini's gemini-embedding-001
// supports Matryoshka output truncation via outputDimensionality, so we ask
// for 768 dims directly (matches the `vector(768)` column in
// scripts/migrate-embeddings.mjs) instead of storing the native 3072 and
// truncating ourselves.
import { GoogleGenAI } from '@google/genai';

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
const OUTPUT_DIM = 768;

// The API accepts a batch of strings per request but free-tier throughput is
// tight; callers own their own rate-limiting/backoff (scripts/embed-dedup.mjs)
// — this function just makes one request per call and lets failures throw.
export async function embedTexts(texts) {
  if (!Array.isArray(texts) || !texts.length) return [];
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: OUTPUT_DIM, taskType: 'SEMANTIC_SIMILARITY' },
  });
  const embeddings = res.embeddings || [];
  if (embeddings.length !== texts.length) {
    throw new Error(`embedTexts: expected ${texts.length} embeddings, got ${embeddings.length}`);
  }
  return embeddings.map((e) => e.values || []);
}
