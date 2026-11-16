// One "this is not an event" rule for every write path (lib/db.js upsertEvent),
// next to lib/cancellation.js. Municipal calendars mix real events with
// administration: waste-collection days, office/consultation hours, notary and
// ombudsman "Sprechtage", council sittings. On a family discovery map those are
// noise ("Restmüllabholung" as a Saturday pick), and the 2026-11-16 audit found
// ~450 distinct such titles upcoming. Kept in the DB (so the next crawl matches
// the row) but never published.
//
// Deliberately NOT here: Blutspenden, Friedenslicht-Abholung, Mutter-Eltern-
// Beratung, Stillgruppe — those are things a family might actually go to.

const WASTE = /(?:^|[^\p{L}])(?:(?:rest|bio|sperr|gift)m(?:ü|ue)ll|m(?:ü|ue)llabfuhr|^m(?:ü|ue)ll(?:\s|$)|altpapier|gelbe[rn]?\s+(?:sack|tonne)|bio\s*(?:tonne|entleerung)|kompostabfuhr|problemstoff|big\s+bag\s+abholung|christbaumabholung|abfuhrgebiet)/iu;
const ADMIN = /(?:sprechtag|sprechstunde|amtstag|notariat|notarsprech|notar-sprech|rechtsberatung|rechtsauskunft|gemeinderatssitzung|sitzung\s+des\s+gemeinderat|^gemeinderat$|parteienverkehr|betriebsanlagen-?\s*sprechtag)/iu;
// A talk ABOUT the topic, or a festive/kids' thing that merely mentions it, stays.
const KEEP = /(?:vortrag|infoveranstaltung|bastel|werkstatt|workshop|kinder|fest\b|markt|tauschtag|\bjahre\b|konzert|lesung)/iu;

export function isNonEventTitle(title) {
  const t = String(title || '').trim();
  if (!t || KEEP.test(t)) return false;
  return WASTE.test(t) || ADMIN.test(t);
}
