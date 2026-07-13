// Deterministic parsers for the public Kreativregion Stuttgart event archive,
// WordPress REST records and per-event iCal exports. Only factual fields are
// returned; source prose and images are intentionally ignored.

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripTags(value) {
  return decodeEntities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function archiveEventLinks(html) {
  const links = [];
  for (const match of String(html || '').matchAll(/<article\b[^>]*itemtype=["']https:\/\/schema\.org\/Event["'][\s\S]*?<\/article>/gi)) {
    const href = match[0].match(/<h2\b[\s\S]*?<a\b[^>]*href=["'](https:\/\/kreativ\.region-stuttgart\.de\/termine\/[^"']+)["']/i)?.[1];
    if (href) links.push(href);
  }
  return [...new Set(links)];
}

export function archivePageCount(html) {
  const pages = [...String(html || '').matchAll(/\/termine\/page\/(\d+)\//gi)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  return Math.max(1, ...pages);
}

export function eventIdFromDetail(html) {
  const value = String(html || '').match(/https:\/\/kreativ\.region-stuttgart\.de\/feed\/calendar\/?\?id=(\d+)/i)?.[1];
  return value ? Number(value) : null;
}

export function venueFromDetail(html) {
  const value = String(html || '').match(/<h5[^>]*>\s*Ort\s*<\/h5>([\s\S]*?)<\/div>/i)?.[1];
  return value ? stripTags(value) || null : null;
}

function unfoldIcs(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeIcs(value) {
  return String(value || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function icsProperty(block, name) {
  const match = block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'im'));
  return match ? unescapeIcs(match[1]) : null;
}

function berlinParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function icsDate(value) {
  const match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return { date: null, time: null };
  const [, year, month, day, hour, minute, second = '00', utc] = match;
  if (utc) return berlinParts(new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)));
  return {
    date: `${year}-${month}-${day}`,
    time: hour == null ? null : `${hour}:${minute}`,
  };
}

const CATEGORY_RULES = [
  [/festival|festspiele|festival/i, 'festival'],
  [/ausstellung|galerie|museum|theater|kunst|literatur|film|kultur/i, 'culture'],
  [/konzert|musik|pop-gala/i, 'music'],
  [/workshop|werkstatt|seminar|training|curriculum|meetup|konferenz|kongress/i, 'workshop'],
  [/familie|kinder|jugend/i, 'family'],
  [/markt|messe/i, 'market'],
  [/sport|lauf|turnier/i, 'sport'],
];

function categoriesFrom(title) {
  return CATEGORY_RULES.flatMap(([pattern, category]) => pattern.test(title) ? [category] : []);
}

const TOWN_NAMES = [
  'Stuttgart', 'Ludwigsburg', 'Schorndorf', 'Sindelfingen', 'Esslingen am Neckar',
  'Esslingen', 'Böblingen', 'Waiblingen', 'Fellbach', 'Leonberg', 'Ditzingen',
  'Kornwestheim', 'Nürtingen', 'Kirchheim unter Teck', 'Göppingen', 'Winnenden',
  'Backnang', 'Bietigheim-Bissingen', 'Vaihingen an der Enz', 'Leinfelden-Echterdingen',
  'Filderstadt', 'Plochingen', 'Köngen', 'Remseck am Neckar', 'Marbach am Neckar',
  'Gerlingen', 'Ostfildern', 'Weinstadt', 'Kernen im Remstal', 'Reutlingen',
];

export function townFromFacts(...facts) {
  const text = facts.filter(Boolean).join(' ');
  if (/\bVilla Merkel\b/i.test(text)) return 'Esslingen';
  if (/\bAreal S(?:ü|ue)d\b/i.test(text)) return 'Stuttgart';
  return TOWN_NAMES.find((town) => new RegExp(`(^|[^\\p{L}])${town.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(text)) || null;
}

export function parseKreativregionIcs(text, fallback = {}) {
  const unfolded = unfoldIcs(text);
  const block = unfolded.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/i)?.[1];
  if (!block) return null;
  // The live generator truncates some SUMMARY values; the REST record is the
  // same publisher's complete canonical title, so prefer it when provided.
  const title = fallback.title || icsProperty(block, 'SUMMARY') || null;
  const sourceUrl = icsProperty(block, 'URL') || fallback.source_url || null;
  const start = icsDate(icsProperty(block, 'DTSTART'));
  const end = icsDate(icsProperty(block, 'DTEND'));
  if (!title || !sourceUrl || !start.date) return null;
  const location = icsProperty(block, 'LOCATION') || fallback.venue || null;
  const bothMidnight = start.time === '00:00' && end.time === '00:00';
  return {
    title,
    description_short: null,
    date_start: start.date,
    time_start: bothMidnight ? null : start.time,
    date_end: end.date,
    time_end: bothMidnight ? null : end.time,
    venue: location,
    address_text: null,
    town: townFromFacts(location, title),
    oblast: 'Baden-Württemberg',
    categories: categoriesFrom(title),
    is_free: null,
    age_min: null,
    age_max: null,
    indoor: null,
    lat: null,
    lng: null,
    source_url: sourceUrl,
    source_name: 'Kreativregion Stuttgart',
    country: 'DE',
  };
}

export function decodeWpTitle(value) {
  return stripTags(value);
}
