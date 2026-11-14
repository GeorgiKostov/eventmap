// The place an address names after its postcode ("Florianstraße 5, 5323 Ebenau"
// → "Ebenau"). Municipal CMSs (GEM2GO "Kiosk" listings above all) re-list
// neighbouring towns' events, and the parsers fill `town` with the LISTING
// town. Before 2026-11-14 that pinned ~4,200 upcoming events on the wrong
// town's centroid and stored each neighbour copy as its own row. The crawl
// (scripts/crawl.mjs) and scripts/migrate-address-towns.mjs use this to put
// the event in the town its own address names.

const TRAILING_COUNTRY = /[,\s]*(?:Österreich|Oesterreich|Austria|Deutschland|Germany)\s*$/iu;
const POSTCODE_PLACE = /(?:^|,)\s*(?:[A-Z]{1,2}\s*[-–]\s*)?\d{4,5}\s+([^,\d][^,]*?)\s*$/u;

export function addressTown(address) {
  const value = String(address || '').replace(TRAILING_COUNTRY, '').trim();
  const m = value.match(POSTCODE_PLACE);
  if (!m) return null;
  const place = m[1].replace(/\s+/g, ' ').trim();
  return place.length >= 2 && /\p{L}/u.test(place) ? place : null;
}

function townTokens(town) {
  return String(town || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(^|[\s-])st\.\s*/g, '$1sankt ')
    .replace(/\./g, '. ')
    .split(/[\s\-–/]+/)
    .filter(Boolean);
}

// An abbreviated token ("b.", "sbg.") stands for a longer one that starts with
// the same letter and contains its letters in order ("bei", "salzburg").
function tokenMatches(short, long) {
  if (short === long || short.replace(/\.$/, '') === long.replace(/\.$/, '')) return true;
  if (!short.endsWith('.')) return false;
  const letters = short.slice(0, -1);
  if (!letters || letters[0] !== long[0]) return false;
  let at = 0;
  for (const ch of long) if (ch === letters[at]) at++;
  return at === letters.length;
}

// Same place, however the source spells it: "Hennersdorf (Niederösterreich)" =
// "Hennersdorf", "St.Georgen b.Sbg." = "Sankt Georgen bei Salzburg", and a
// shorter name that is the start of the longer one ("St. Georgen", "Linz" for
// "Linz-Urfahr"). Whole tokens only: "Steyr" is not "Steyregg".
export function sameTown(a, b) {
  const ta = townTokens(a);
  const tb = townTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((tok, i) => tokenMatches(tok, long[i]) || tokenMatches(long[i], tok));
}
