// One cancellation rule for every write path (lib/db.js upsertEvent). Before
// 2026-11-14 five adapters each carried their own filter and the generic
// GEM2GO/JSON-LD path had none, so "abgesagt: Adventmarkt FF Finklham" stayed
// on the map. A cancelled event shown as happening costs more trust than a
// missing one (hard rule 5).

// Marker words publishers put into the title when a date is off. "verschoben"
// counts: the original occurrence will not happen; a new date is a new row.
// "fällt aus" / "findet nicht statt" only count at the end of a title
// ("Kinderturnen fällt aus"), never mid-title ("Zirkus fällt aus dem Rahmen").
const END_ONLY = String.raw`(?:f(?:ä|ae)llt\s+aus|findet\s+nicht\s+statt)(?=[\s!.)*]*$)`;
const MARKER = String.raw`abgesagt|abgesag[dt]|entf(?:ä|ae)llt|verschoben|storniert|cancell?ed|postponed|${END_ONLY}`;
const ANY = new RegExp(String.raw`(?:^|[^\p{L}])(?:${MARKER})(?=$|[^\p{L}])`, 'iu');
const LEADING = new RegExp(String.raw`^[\s*!(\[„"'–—-]*(?:${MARKER})[\s*!:/)\]"'–—-]*`, 'iu');
const TRAILING = new RegExp(String.raw`[\s*!:/(\[–—-]*(?:${MARKER}).*$`, 'iu');

export function isCancelledTitle(title) {
  return ANY.test(String(title || ''));
}

// The title the event had before the publisher marked it, so the earlier,
// unmarked row of the same occurrence can be unpublished too.
// "abgesagt: Adventmarkt FF Finklham" → "Adventmarkt FF Finklham";
// "Silvesterlauf ABGESAGT" → "Silvesterlauf". Null when nothing sensible is left.
export function uncancelledTitle(title) {
  const value = String(title || '');
  if (!isCancelledTitle(value)) return null;
  const stripped = value.replace(LEADING, '').replace(TRAILING, '').trim();
  return stripped.length >= 3 && stripped !== value.trim() ? stripped : null;
}

// schema.org eventStatus values that mean "do not show as happening".
export function isCancelledStatus(eventStatus) {
  return /EventCancelled|EventPostponed/i.test(String(eventStatus || ''));
}
