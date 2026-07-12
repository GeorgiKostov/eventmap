// Map-only grouping helpers. These do not alter the underlying event rows:
// list/detail pages still expose every occurrence independently.

function normalizedWords(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizedLabel(value) {
  return normalizedWords(value).join(' ');
}

function titleWords(event) {
  const townWords = new Set(normalizedWords(event.town));
  return normalizedWords(event.title).filter((word) => !/^20\d{2}$/.test(word) && !townWords.has(word));
}

function sameSeriesTitle(a, b) {
  const aTitle = normalizedLabel(a.title);
  const bTitle = normalizedLabel(b.title);
  if (!aTitle || !bTitle) return false;
  if (aTitle === bTitle) return true;

  // Accept only a conservative near-match: at least three shared meaningful
  // words and one title almost fully contained in the other. This catches
  // suffix variants such as "… Linz" / "… 2026" without grouping generic
  // festival-program titles merely because they share "festival".
  const aw = new Set(titleWords(a));
  const bw = new Set(titleWords(b));
  if (Math.min(aw.size, bw.size) < 3) return false;
  let shared = 0;
  for (const word of aw) if (bw.has(word)) shared++;
  return shared >= 3 && shared / Math.min(aw.size, bw.size) >= 0.9;
}

function anchorFor(members) {
  const precise = members.filter((event) => event.geo_precision !== 'town');
  if (!precise.length) return members[0];

  // Prefer the most common resolved venue. Coordinate buckets cover rows whose
  // venue is absent or spelled differently while still resolving to one place.
  const buckets = new Map();
  for (const event of precise) {
    const venue = normalizedLabel(event.venue);
    const key = venue
      ? `venue:${venue}`
      : `coord:${Number(event.lat).toFixed(4)}:${Number(event.lng).toFixed(4)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(event);
  }
  return [...buckets.values()]
    .sort((a, b) => b.length - a.length || Number(b[0].geo_precision === 'venue') - Number(a[0].geo_precision === 'venue'))[0][0];
}

// A series is the same (or conservatively near-identical) title within one
// town. Town scoping is load-bearing: generic titles such as "Bauernmarkt" or
// "Feuerwehrfest" occur independently throughout Austria.
export function groupEventSeries(events) {
  const byTown = new Map();
  for (const event of events) {
    if (!event || event.kind === 'place') continue;
    const town = normalizedLabel(event.town);
    if (!town) continue;
    if (!byTown.has(town)) byTown.set(town, []);
    byTown.get(town).push(event);
  }

  const groups = [];
  const byId = new Map();
  for (const townEvents of byTown.values()) {
    const townGroups = [];
    const exactGroups = new Map();
    const groupsByWord = new Map();
    for (const event of townEvents) {
      const exactTitle = normalizedLabel(event.title);
      let group = exactGroups.get(exactTitle);
      if (!group) {
        // Near-matches require at least three shared words. Use that invariant
        // as an inverted index so we compare only plausible series instead of
        // scanning every title in a town for every event.
        const candidates = new Map();
        for (const word of new Set(titleWords(event))) {
          for (const candidate of groupsByWord.get(word) || []) {
            candidates.set(candidate, (candidates.get(candidate) || 0) + 1);
          }
        }
        group = [...candidates]
          .filter(([, shared]) => shared >= 3)
          .sort(([a], [b]) => a.index - b.index)
          .map(([candidate]) => candidate)
          .find((candidate) => sameSeriesTitle(candidate.members[0], event));
      }
      if (!group) {
        group = { index: townGroups.length, members: [] };
        townGroups.push(group);
        for (const word of new Set(titleWords(event))) {
          if (!groupsByWord.has(word)) groupsByWord.set(word, []);
          groupsByWord.get(word).push(group);
        }
      }
      group.members.push(event);
      if (exactTitle) exactGroups.set(exactTitle, group);
    }
    for (const group of townGroups) {
      if (group.members.length < 2) continue;
      group.anchor = anchorFor(group.members);
      groups.push(group);
      for (const event of group.members) byId.set(event.id, group);
    }
  }
  return { groups, byId };
}
