// Enns publishes dates inside server-rendered detail data, never in its sitemap.
import { decodeEntities } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const ENNS_SOURCE_URL = 'https://erlebe.enns.at/sitemap-events.xml';

export function ennsDetailUrls(xml) {
  return [...new Set([...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => decodeEntities(match[1]))
    .filter((url) => /^https:\/\/erlebe\.enns\.at\/events\/[^/]+\/\d+$/.test(url)))];
}

export function parseEnnsDetail(html, sourceUrl) {
  const match = String(html).match(/"singleViewPageData":(\{[\s\S]*?\}),"singleViewLunchData"/);
  if (!match) return [];
  let event;
  try { event = JSON.parse(match[1]); } catch { return []; }
  if (event.type !== 'EVENT' || !event.title || event.country !== 'AT') return [];
  // Explicit local occurrences win over UTC startDate/endDate and prose ranges.
  // A missing date or recurring weekday without a date cannot supply an occurrence.
  return (event.openingHours || []).filter((hours) =>
    !hours.closed && !hours.onRequest && /^\d{4}-\d{2}-\d{2}$/.test(hours.openingHourDate || ''),
  ).map((hours) => {
    const clock = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value : null;
    const categories = [];
    if (/markt/i.test(event.title)) categories.push('market');
    if (/kind|famil/i.test(event.title)) categories.push('family');
    if (/konzert|musik/i.test(event.title)) categories.push('music');
    if (/kino|museum|theater|kultur/i.test(`${event.title} ${(event.categories || []).join(' ')}`)) categories.push('culture');
    return {
      title: event.title, date_start: hours.openingHourDate,
      time_start: clock(hours.openingHourStart), date_end: null,
      time_end: hours.openEnd ? null : clock(hours.openingHourEnd),
      venue: null, address: [event.addressLine, event.zipCode].filter(Boolean).join(', ') || null,
      town: event.city || 'Enns', categories, description: null,
      is_free: null, age_min: null, age_max: null, indoor: null,
      lat: typeof event.lat === 'number' ? event.lat : null,
      lng: typeof event.lon === 'number' ? event.lon : null,
      source_url: sourceUrl,
    };
  });
}

export async function fetchEnnsEvents(xml, {
  fetchImpl = politeFetch, robotsFn = robotsAllowed,
} = {}) {
  const urls = ennsDetailUrls(xml);
  if (!urls.length) throw new Error('Enns sitemap contains no event detail links');
  const events = [];
  for (const url of urls) {
    if (!(await robotsFn(url))) continue;
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Enns detail HTTP ${response.status}: ${url}`);
    events.push(...parseEnnsDetail(await response.text(), url));
  }
  if (!events.length) throw new Error('Enns detail pages yielded no dated occurrences');
  return events;
}
