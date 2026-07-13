// Lightweight spam/abuse guard for anonymous submissions. Not a full moderation
// system (that's post-validation) — just enough to keep obvious spam, scams, and
// adult content off a family map. Combined with rate limiting + easy deletion.
const SPAM_WORDS = [
  'viagra', 'cialis', 'casino', 'porn', 'escort', 'xxx', 'nude', 'crypto',
  'bitcoin', 'forex', 'payday', 'seo service', 'buy followers', 'weight loss',
  'make money', 'work from home', 'hot singles', 'onlyfans', 'gambling', 'betting',
];
// Match each blocklist word as a whole token, not a substring — `.includes('sex')`
// used to reject "Sextet"/"Sexta", and this map runs on scanned posters in Latin,
// German, and Cyrillic. `\p{L}\p{N}` boundaries are Unicode-aware; internal spaces
// in phrases become `\s+`. Anchoring on token edges is what makes it safe to drop
// short generic words like "loan"/"sex" that wrecked innocent titles.
const SPAM_RE = SPAM_WORDS.map((w) => ({
  word: w,
  re: new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu'),
}));
const URL_RE = /(https?:\/\/|www\.)\S+/i;
const PHONE_SPAM_RE = /(call|whatsapp|viber|text)\s*(now|us|me)?[\s:+]*\+?\d[\d\s()-]{7,}/i;

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

// Coverage bounding boxes (generous buffer). Client-supplied pin-drop coords skip
// server geocoding, so they need their own bounds check. We now run in Austria and
// Bulgaria — add a box per country here as coverage expands.
const SERVICE_AREAS = [
  { name: 'AT', latMin: 46.2, latMax: 49.2, lngMin: 9.3, lngMax: 17.4 },
  { name: 'BG', latMin: 41.1, latMax: 44.3, lngMin: 22.3, lngMax: 28.7 },
];
export function inServiceArea(lat, lng) {
  return SERVICE_AREAS.some(
    (a) => lat >= a.latMin && lat <= a.latMax && lng >= a.lngMin && lng <= a.lngMax
  );
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
  if (typeof body.lat === 'number' && typeof body.lng === 'number' && !inServiceArea(body.lat, body.lng)) {
    return 'coords_outside_area';
  }
  return null;
}

// Returns a reason string when the content looks abusive, else null.
//
// The keyword blocklist runs on everything. The noisier heuristics (URL in title,
// phone-number spam, all-caps shouting) only run in `strict` mode — i.e. for
// hand-typed community entries. Scan/link submissions already passed through AI
// extraction, and real posters routinely SHOUT and print "tickets: Viber +359…",
// so judging those by a keyword tripwire just rejected legitimate events.
export function spamReason(title, description, { strict = true } = {}) {
  const rawTitle = `${title || ''}`;
  const body = `${title || ''} ${description || ''}`;

  for (const { word, re } of SPAM_RE) {
    if (re.test(body)) return `spam_word:${word}`;
  }
  if (!strict) return null;

  if (URL_RE.test(rawTitle)) return 'link_in_title';
  if (PHONE_SPAM_RE.test(body)) return 'phone_spam';
  // shouting: a long, all-caps title. Unicode-aware so it treats Latin, German,
  // and Cyrillic alike; the lower-case guard skips caseless scripts (e.g. CJK).
  const letters = [...rawTitle].filter((c) => /\p{L}/u.test(c)).join('');
  if (letters.length > 12 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return 'all_caps';
  }
  return null;
}
