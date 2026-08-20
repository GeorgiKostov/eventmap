// Deterministic adapter for the official Rockhouse Salzburg programme.
//
// The Nuxt server response embeds the current Vivenu listing in __NUXT_DATA__.
// It is a devalue-style reference table, not a public JSON endpoint, so this
// adapter resolves only the small subset needed for event facts and links each
// row to its official Rockhouse detail page. No poster or description content
// is copied.

import { politeFetch, robotsAllowed } from './crawl-net.js';

export const ROCKHOUSE_SOURCE_URL = 'https://www.rockhouse.at/de/events';

function scriptPayload(html) {
  const marker = 'id="__NUXT_DATA__"';
  const markerAt = String(html || '').indexOf(marker);
  if (markerAt < 0) return null;
  const start = String(html).indexOf('>', markerAt);
  const end = String(html).indexOf('</script>', start);
  if (start < 0 || end < 0) return null;
  try {
    const payload = JSON.parse(String(html).slice(start + 1, end));
    return Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

// Nuxt's payload stores values in a reference table. Numeric values in the
// table are references; primitive numbers that are not references are encoded
// as non-integers. Resolve wrappers and objects while failing closed on cycles.
function resolvePayload(payload) {
  const memo = new Map();
  function resolve(index, stack = new Set()) {
    if (!Number.isInteger(index) || index < 0 || index >= payload.length) return index;
    if (memo.has(index)) return memo.get(index);
    if (stack.has(index)) return null;
    const nextStack = new Set(stack).add(index);
    const raw = payload[index];
    let value;
    if (Array.isArray(raw)) {
      if (raw.length === 2 && typeof raw[0] === 'string' && Number.isInteger(raw[1])) {
        value = resolve(raw[1], nextStack);
      } else {
        value = raw.map((item) => resolve(item, nextStack));
      }
    } else if (raw && typeof raw === 'object') {
      value = {};
      for (const [key, item] of Object.entries(raw)) value[key] = resolve(item, nextStack);
    } else {
      value = raw;
    }
    memo.set(index, value);
    return value;
  }
  return resolve(0);
}

function localViennaParts(value) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Vienna',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part]));
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return null;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function eventUrl(slug, baseUrl) {
  if (!slug || typeof slug !== 'string' || slug.includes('/')) return null;
  try { return new URL(`/de/events/${encodeURIComponent(slug)}`, baseUrl).toString(); } catch { return null; }
}

function categoriesForRecord(record) {
  const attributes = record.attributes && typeof record.attributes === 'object' ? record.attributes : {};
  const signals = [
    record.name, record.slogan, attributes.type, attributes.genre,
    ...(Array.isArray(record.tags) ? record.tags : []),
  ].filter((value) => typeof value === 'string').join(' ').toLowerCase();
  const categories = [];
  if (/workshop|academy|seminar|kurs/.test(signals)) categories.push('workshop');
  if (/kinder|jugend|famil/.test(signals)) categories.push('family');
  if (/club|clubbing|party|disco/.test(signals)) categories.push('party');
  if (/theater|theatre|kabarett|lesung|film|vernissage|ausstellung/.test(signals)) categories.push('culture');
  if (/musik|music|rock|pop|punk|folk|blues|jazz|metal|hip.?hop|rap|acoustic|indie|electro|hardcore|reggae|dancehall|bluegrass|soul|tribute|cover|austro|alternative|schlager|new wave|dark|disco/.test(signals)) {
    categories.push('music');
  }
  return [...new Set(categories)];
}

function collectRecords(value, records = []) {
  if (!value || typeof value !== 'object') return records;
  if (!Array.isArray(value)
    && typeof value._id === 'string'
    && typeof value.name === 'string'
    && typeof value.start === 'string'
    && /^\d{4}-\d{2}-\d{2}T/.test(value.start)
    && typeof value.url === 'string') {
    records.push(value);
  }
  for (const child of Object.values(value)) collectRecords(child, records);
  return records;
}

export function parseRockhouseEventsHtml(html, src = {}) {
  const payload = scriptPayload(html);
  if (!payload) return [];
  const root = resolvePayload(payload);
  const seen = new Set();
  const baseUrl = src.url || ROCKHOUSE_SOURCE_URL;
  const events = [];
  for (const record of collectRecords(root)) {
    if (seen.has(record._id)) continue;
    seen.add(record._id);
    const start = localViennaParts(record.start);
    const end = record.end ? localViennaParts(record.end) : null;
    const source_url = eventUrl(record.url, baseUrl);
    if (!record.name.trim() || !start || !source_url) continue;
    events.push({
      title: record.name.trim(),
      date_start: start.date,
      time_start: start.time,
      date_end: end?.date || null,
      time_end: end?.time || null,
      venue: typeof record.attributes?.location === 'string'
        ? record.attributes.location.trim() || null
        : (typeof record.locationName === 'string' ? record.locationName.trim() || null : null),
      address: null,
      town: src.town || 'Salzburg',
      categories: categoriesForRecord(record),
      is_free: null,
      age_min: null,
      age_max: null,
      indoor: null,
      description: null,
      source_url,
    });
  }
  return events;
}

export async function fetchRockhouseEvents(src = { url: ROCKHOUSE_SOURCE_URL }, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  shellHtml = null,
} = {}) {
  const sourceUrl = src.url || ROCKHOUSE_SOURCE_URL;
  try {
    if (!(await robotsFn(sourceUrl))) return [];
  } catch {
    return [];
  }
  let html = shellHtml;
  if (html == null) {
    try {
      const response = await fetchImpl(sourceUrl);
      if (!response?.ok) return [];
      html = await response.text();
    } catch {
      return [];
    }
  }
  return parseRockhouseEventsHtml(html, src);
}
