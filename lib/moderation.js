// Lightweight spam/abuse guard for anonymous submissions. Not a full moderation
// system (that's post-validation) — just enough to keep obvious spam, scams, and
// adult content off a family map. Combined with rate limiting + easy deletion.
const SPAM_WORDS = [
  'viagra', 'cialis', 'casino', 'porn', 'sex', 'escort', 'xxx', 'nude', 'crypto',
  'bitcoin', 'forex', 'loan', 'payday', 'seo service', 'buy followers', 'weight loss',
  'make money', 'work from home', 'hot singles', 'onlyfans', 'gambling', 'betting',
];
const URL_RE = /(https?:\/\/|www\.)\S+/i;
const PHONE_SPAM_RE = /(call|whatsapp|text)\s*(now|us|me)?[\s:+]*\+?\d[\d\s()-]{7,}/i;

// Strip HTML tags + control chars, collapse whitespace. Applied to every free-
// text field of an anonymous submission before it's stored/rendered.
export function sanitizeText(s, max = 500) {
  if (s == null) return null;
  const clean = String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return clean || null;
}

// Austria bounding box (generous buffer). Client-supplied pin-drop coords skip
// server geocoding, so they need their own bounds check.
export function inAustria(lat, lng) {
  return lat >= 46.2 && lat <= 49.2 && lng >= 9.3 && lng <= 17.4;
}

// Plausibility checks for anonymous submissions. Returns a reason or null.
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export function submissionProblem(body, kind, viennaToday) {
  if (String(body.title || '').trim().length < 3) return 'title_too_short';
  if (kind === 'event') {
    if (!DATE_RE.test(body.starts_at || '')) return 'bad_date_format';
    const day = body.starts_at.slice(0, 10);
    const past = new Date(viennaToday + 'T12:00').getTime() - new Date(day + 'T12:00').getTime();
    if (past > 2 * 86400000) return 'date_in_past';
    if (-past > 400 * 86400000) return 'date_too_far_out';
    if (body.ends_at != null && !DATE_RE.test(body.ends_at)) return 'bad_date_format';
  }
  if (typeof body.lat === 'number' && typeof body.lng === 'number' && !inAustria(body.lat, body.lng)) {
    return 'coords_outside_austria';
  }
  return null;
}

// Returns a reason string when the content looks abusive, else null.
export function spamReason(title, description) {
  const rawTitle = `${title || ''}`;
  const bodyLc = `${title || ''} ${description || ''}`.toLowerCase();

  if (URL_RE.test(rawTitle)) return 'link_in_title';
  if (PHONE_SPAM_RE.test(bodyLc)) return 'phone_spam';
  for (const w of SPAM_WORDS) {
    if (bodyLc.includes(w)) return `spam_word:${w}`;
  }
  // shouting: a long, all-caps title (compare the original casing)
  const letters = rawTitle.replace(/[^a-zäöüßA-ZÄÖÜ]/g, '');
  if (letters.length > 12 && letters === letters.toUpperCase()) return 'all_caps';
  return null;
}
