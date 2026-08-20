const EVENT_ALIASES = new Map([
  // Five municipal/festival copies of the same Varna Summer opera occurrence.
  ['22229', '22241'],
  ['34677', '22241'],
  ['34769', '22241'],
  ['34892', '22241'],
  // Municipal calendars across OÖ copied the same statewide Mariendom concert.
  ['2253', '1146'],
  ['12822', '1146'],
  ['44999', '1146'],
  ['73592', '1146'],
  ['12664', '1146'],
]);

export function isEventId(value) {
  return /^\d+$/.test(String(value || ''));
}

export function canonicalEventPath(pathname) {
  const match = /^\/event\/(\d+)$/.exec(String(pathname || ''));
  const canonical = match ? EVENT_ALIASES.get(match[1]) : null;
  return canonical ? `/event/${canonical}` : null;
}

export const EVENT_ALIAS_IDS = [...EVENT_ALIASES.keys()];
