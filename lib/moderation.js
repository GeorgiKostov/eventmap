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
