// Editor-written event descriptions (docs/ops/editor-descriptions.md).
//
// Since the 2026-10-27 AI shutdown no crawler writes descriptions, and the
// sitemap only lists described events (lib/db.js sitemapEvents). Descriptions
// are now written in an interactive or scheduled Claude Code / Codex session
// under George's subscription — never by a metered API — and imported through
// scripts/descriptions.mjs, which applies the checks below. Pure, so tests can
// pin the rules without a database.

export const MIN_LEN = 40;
export const MAX_LEN = 280;
// Shared run of this many words with the source excerpt = copied prose
// (hard rule 1: facts + linkback, never copy). Short enough to catch a lifted
// clause, long enough that venue names and dates alone never trip it.
const COPY_RUN_WORDS = 7;

export function normalizedWords(value) {
  return String(value || '').toLocaleLowerCase('de').normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
}

const keyPart = (value) => normalizedWords(value).join(' ');

// One description serves every occurrence of a series: same title at the same
// place. Occurrence-specific facts (dates, times) therefore never belong in it.
export function seriesKey(ev) {
  return `${keyPart(ev.title)}|${keyPart(ev.venue || ev.address || ev.town)}`;
}

function sharedRun(a, b, n) {
  if (a.length < n || b.length < n) return false;
  const runs = new Set();
  for (let i = 0; i + n <= b.length; i += 1) runs.add(b.slice(i, i + n).join(' '));
  for (let i = 0; i + n <= a.length; i += 1) if (runs.has(a.slice(i, i + n).join(' '))) return true;
  return false;
}

// Returns null when the text may be stored, otherwise the reason it may not.
export function descriptionProblem(text, { title = '', excerpt = '' } = {}) {
  if (typeof text !== 'string') return 'missing';
  const value = text.trim();
  if (value.length < MIN_LEN) return `shorter than ${MIN_LEN} characters`;
  if (value.length > MAX_LEN) return `longer than ${MAX_LEN} characters`;
  if (/[\r\n]/.test(value)) return 'contains a line break';
  if (/https?:\/\/|www\.|@|\b\d{3,}[\s/-]?\d{3,}\b/i.test(value)) return 'contains a link, email or phone number';
  // A date belongs to one occurrence, not the series this text is shared by.
  if (/\b\d{1,2}\.\s?\d{1,2}\.|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[:.]\d{2}\s?uhr\b/i.test(value)) return 'contains a date or time';
  const words = normalizedWords(value);
  const titleWords = new Set(normalizedWords(title));
  if (words.filter((w) => !titleWords.has(w)).length < 4) return 'only restates the title';
  if (sharedRun(words, normalizedWords(excerpt), COPY_RUN_WORDS)) return 'copies source wording';
  return null;
}

// The part of a source page that talks about this event. CMS pages repeat the
// title in <title>/breadcrumbs before the body heading, so start at its last
// visible mention among the first three; the page start when it is not found.
export function excerptFor(pageText, title, size = 1200) {
  const text = String(pageText || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const lower = text.toLocaleLowerCase('de');
  const needle = String(title || '').toLocaleLowerCase('de').trim();
  const hits = [];
  for (let at = needle ? lower.indexOf(needle) : -1; at >= 0 && hits.length < 3; at = lower.indexOf(needle, at + needle.length)) {
    hits.push(at);
  }
  // A mention followed by a quote sits inside the JSON-LD tail htmlToText
  // appends; use it only when the visible text never names the event.
  const visible = hits.filter((at) => text[at + needle.length] !== '"');
  const start = visible.at(-1) ?? hits[0] ?? 0;
  return text.slice(start, start + size);
}
