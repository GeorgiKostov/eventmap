// Deterministic adapter for the Bregenzer Festspiele schedule. The public
// schedule is a client-rendered Next.js page; its official Server Actions
// return the event and production records needed here. Facts only: prose,
// images, and ticket availability are deliberately not copied.

import { splitLocalDateTime, validDateOf, validTimeOf } from './event-time.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export const BREGENZER_FESTSPIELE_SCHEDULE_URL =
  'https://bregenzerfestspiele.com/de/karten-besuch/spielplan';

// Current IDs are a fallback for when a deployment's JavaScript bundle cannot
// be fetched. discoverBregenzerActionIds() takes precedence when the bundle
// exposes newer IDs. Next rotates these identifiers on deploy, so a failed
// action is always treated as an empty result rather than guessed data.
export const BREGENZER_ACTION_IDS = Object.freeze({
  events: '00cecb368450d25b5ab216055ce9bb45b72e2af98b',
  productions: '005bf74b395ee796cb39e8e5b6ea55217bf15cd9d6',
});

const ACTION_NAMES = Object.freeze({
  fetchRedisData: 'events',
  fetchProductions: 'productions',
});

function responseOk(response) {
  return !!response && response.ok !== false && Number(response.status || 200) < 400;
}

function absoluteUrl(value, base) {
  if (!value) return null;
  try { return new URL(String(value), base).toString(); } catch { return null; }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

// Server Action responses are newline-delimited RSC records. Only JSON
// records are considered; malformed records are ignored so one upstream
// protocol change cannot fabricate or abort a whole crawl.
function jsonRecords(responseText) {
  const records = [];
  for (const line of String(responseText || '').split(/\r?\n/)) {
    const match = line.match(/^\d+:([\[{].*)$/);
    if (!match) continue;
    try { records.push(JSON.parse(match[1])); } catch { /* fail closed per record */ }
  }
  return records;
}

function eventPayload(responseText) {
  return jsonRecords(responseText).find((record) => Array.isArray(record?.events)) || null;
}

function productionPayload(responseText) {
  return jsonRecords(responseText).find((record) => {
    if (!record || Array.isArray(record) || typeof record !== 'object' || record.events) return false;
    return Object.values(record).some((value) => value && typeof value === 'object'
      && (value.color !== undefined || value.data !== undefined));
  }) || null;
}

// Find action references in a Next bundle. The source currently looks like:
// createServerReference("hash", ..., "fetchRedisData"). Keep the window
// bounded so an unrelated string elsewhere in a large bundle cannot pair with
// the wrong action.
export function discoverBregenzerActionIds(...sources) {
  const found = {};
  const text = sources.flatMap((source) => Array.isArray(source) ? source : [source])
    .filter((source) => source != null).map(String).join('\n');
  const pattern = /createServerReference\(\s*["']([A-Za-z0-9_-]+)["'][\s\S]{0,500}?["'](fetchRedisData|fetchProductions)["']/gi;
  for (const match of text.matchAll(pattern)) {
    const key = ACTION_NAMES[match[2]];
    if (key && !found[key]) found[key] = match[1];
  }
  return found;
}

function scriptUrls(html, base) {
  const urls = [];
  for (const match of String(html || '').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const url = absoluteUrl(match[1], base);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function inlineScriptText(html) {
  return [...String(html || '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function productionPath(production, base) {
  const languageRows = production?.data?.de || production?.data?.en || [];
  const row = Array.isArray(languageRows) ? languageRows.find((item) => item?.path) : null;
  return absoluteUrl(row?.path, base);
}

function categoriesFrom(event) {
  const text = `${event?.title || ''} ${event?.productionName || ''} ${event?.genreName || ''}`;
  const categories = [];
  if (/konzert|orchester|musik|oper|traviata|elisir/i.test(text)) categories.push('music');
  if (/festspiel|festival/i.test(text)) categories.push('festival');
  if (/theater|theatre|führung|einf(?:ü|ue)hrung|kultur/i.test(text)) categories.push('culture');
  if (/familie|kinder|jugend/i.test(text)) categories.push('family');
  return categories;
}

function eventSourceUrl(event, production, scheduleUrl) {
  return absoluteUrl(event?.url, scheduleUrl)
    || productionPath(production, scheduleUrl)
    || scheduleUrl;
}

export function parseBregenzerEventsResponse(responseText, src = {}, productions = {}) {
  const payload = eventPayload(responseText);
  if (!payload) return [];
  const scheduleUrl = absoluteUrl(src.url, BREGENZER_FESTSPIELE_SCHEDULE_URL)
    || BREGENZER_FESTSPIELE_SCHEDULE_URL;
  const town = clean(src.town) || 'Bregenz';
  const events = [];
  for (const event of payload.events) {
    const title = clean(event?.title) || clean(event?.productionName);
    const { date, time } = splitLocalDateTime(event?.start);
    if (!title || !validDateOf(date)) continue;
    const validTime = time && validTimeOf(`${date}T${time}`) ? time : null;
    const production = productions[String(event?.productionNumber)] || productions[String(event?.id)];
    events.push({
      title,
      date_start: date,
      time_start: validTime,
      date_end: null,
      time_end: null,
      venue: clean(event?.performanceLocationName) || clean(event?.venueName),
      address: null,
      town,
      categories: categoriesFrom(event),
      is_free: null,
      age_min: null,
      age_max: null,
      indoor: null,
      description: null,
      source_url: eventSourceUrl(event, production, scheduleUrl),
    });
  }
  return events;
}

export function parseBregenzerProductionsResponse(responseText) {
  return productionPayload(responseText) || {};
}

async function readText(response) {
  try { return responseOk(response) ? await response.text() : null; } catch { return null; }
}

async function discoverActions(fetchImpl, robotsFn, scheduleUrl, html, maxScripts) {
  const sources = inlineScriptText(html);
  for (const scriptUrl of scriptUrls(html, scheduleUrl).slice(0, maxScripts)) {
    // Only Next bundles can contain the action references. Avoid unrelated
    // analytics/third-party scripts and respect the site's robots policy for
    // every additional request.
    if (!scriptUrl.includes('/_next/static/')) continue;
    try {
      if (!(await robotsFn(scriptUrl))) continue;
      const response = await fetchImpl(scriptUrl);
      const text = await readText(response);
      if (text) {
        sources.push(text);
        const found = discoverBregenzerActionIds(sources);
        if (found.events && found.productions) return found;
      }
    } catch { /* action IDs can fall back to the last known official IDs */ }
  }
  return discoverBregenzerActionIds(sources);
}

async function postAction(fetchImpl, robotsFn, scheduleUrl, actionId) {
  if (!actionId) return null;
  try {
    if (!(await robotsFn(scheduleUrl))) return null;
    const response = await fetchImpl(scheduleUrl, {
      method: 'POST',
      headers: {
        Accept: 'text/x-component',
        'Content-Type': 'text/plain;charset=UTF-8',
        'Next-Action': actionId,
      },
      body: '[]',
    });
    return readText(response);
  } catch { return null; }
}

async function firstUsefulAction(fetchImpl, robotsFn, scheduleUrl, ids, predicate) {
  for (const id of unique(ids)) {
    const text = await postAction(fetchImpl, robotsFn, scheduleUrl, id);
    if (text && predicate(text)) return text;
  }
  return null;
}

export async function fetchBregenzerFestspieleEvents(src = {}, {
  fetchImpl = politeFetch,
  robotsFn = robotsAllowed,
  actionIds = {},
  maxScripts = 40,
  shellHtml = null,
} = {}) {
  if (typeof fetchImpl !== 'function') return [];
  const scheduleUrl = absoluteUrl(src.url, BREGENZER_FESTSPIELE_SCHEDULE_URL)
    || BREGENZER_FESTSPIELE_SCHEDULE_URL;
  let html = shellHtml;
  try {
    if (!(await robotsFn(scheduleUrl))) return [];
    if (html == null) html = await readText(await fetchImpl(scheduleUrl));
  } catch { return []; }
  if (!html) return [];

  // The pinned IDs are tried first: this keeps a normal crawl to one page GET
  // plus two action POSTs. Bundle discovery is the recovery path for a deploy
  // that rotated the Next action hashes, not an unnecessary extra crawl of
  // every script tag on every run.
  let eventResponse = await firstUsefulAction(
    fetchImpl, robotsFn, scheduleUrl,
    [actionIds.events, BREGENZER_ACTION_IDS.events], (text) => !!eventPayload(text),
  );
  let productionResponse = await firstUsefulAction(
    fetchImpl, robotsFn, scheduleUrl,
    [actionIds.productions, BREGENZER_ACTION_IDS.productions], (text) => !!productionPayload(text),
  );

  if (!eventResponse || !productionResponse) {
    const discovered = await discoverActions(fetchImpl, robotsFn, scheduleUrl, html, maxScripts);
    if (!eventResponse) {
      eventResponse = await firstUsefulAction(
        fetchImpl, robotsFn, scheduleUrl, [discovered.events], (text) => !!eventPayload(text),
      );
    }
    if (!productionResponse) {
      productionResponse = await firstUsefulAction(
        fetchImpl, robotsFn, scheduleUrl, [discovered.productions], (text) => !!productionPayload(text),
      );
    }
  }
  if (!eventResponse) return [];

  return parseBregenzerEventsResponse(
    eventResponse,
    { ...src, url: scheduleUrl },
    productionResponse ? parseBregenzerProductionsResponse(productionResponse) : {},
  );
}
