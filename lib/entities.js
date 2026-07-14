// HTML/XML entity decoding — ONE definition, imported by every adapter and by
// the write boundary in lib/db.js.
//
// The bug this replaces: nine hand-rolled `decodeEntities` copies had each
// grown a different, partial list of named entities, and only two of them
// handled NUMERIC references at all. So `&#8211;` (an en-dash — the single most
// common character in a German event title, "Sommerfest &#8211; Kramer in der
// Au") survived every path that didn't happen to spell it out, and 66 published
// titles carried raw entity text. WordPress makes this the default case: it
// entity-encodes inside JSON-LD and RSS, where JSON.parse/XML parsing decode
// their own escapes but never HTML's.
//
// Rules:
//   · numeric (decimal + hex) is handled generically — no entity list can keep
//     up with what a CMS emits, so don't try;
//   · two passes, because double-encoding is real and rampant (WordPress emits
//     `&#038;` = an already-encoded `&`, and `&amp;#8211;` shows up in the wild);
//   · invalid/dangerous codepoints decode to nothing rather than throwing —
//     String.fromCodePoint() throws on surrogates and out-of-range values, and
//     one bad title must never abort a crawl (per-item isolation, lessons.md).

const NAMED = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', prime: '′', Prime: '″',
  euro: '€', pound: '£', deg: '°', copy: '©', reg: '®', trade: '™',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', eacute: 'é', egrave: 'è', ecirc: 'ê',
  iacute: 'í', oacute: 'ó', ocirc: 'ô', uacute: 'ú', ccedil: 'ç', ntilde: 'ñ',
  times: '×', divide: '÷', shy: '', zwnj: '', zwj: '', ensp: ' ', emsp: ' ', thinsp: ' ',
};

function codePoint(n) {
  // Surrogate halves and out-of-range values are not text; drop them.
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '';
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

function decodeOnce(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(Number(dec)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,9});/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : m,
    );
}

export function decodeEntities(s) {
  if (s === null || s === undefined) return '';
  let out = String(s);
  // Two passes only: enough for the double-encoding CMSs actually produce,
  // bounded so a pathological input can't loop.
  for (let i = 0; i < 2; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

// HTML fragment → plain text. Tags become a SPACE, never nothing: dropping them
// silently welds adjacent nodes together ("...der ErdeDie progressiven...").
export function stripTags(s) {
  return decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// The normalization applied to every stored text field at the write boundary
// (lib/db.js upsertEvent): decode entities, normalize NBSP and control chars to
// spaces, collapse runs, trim. Deliberately does NOT strip tags — a title is not
// an HTML fragment, and a legitimate "<3" must survive.
export function cleanText(s) {
  if (s === null || s === undefined) return s;
  return decodeEntities(s)
    .replace(/[\u00a0\u2007\u202f\ufeff]/g, ' ') // NBSP family + BOM -> plain space
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u00ad]/g, '') // control chars + soft hyphen
    .replace(/\s+/g, ' ')
    .trim();
}
