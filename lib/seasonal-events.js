// Title facts only: no inferred holidays from descriptions, venues, or categories.
// Patterns deliberately use the syntax shared by JavaScript and Postgres regexes.
export const SEASONAL_THEMES = {
  christmas_market: {
    pattern: 'weihnachts[- ]?(markt|märkte|maerkte|dorf|dörfer|basar)|christkindl?[- ]?(markt|märkte|maerkte)|advents?[- ]?(markt|märkte|maerkte|dorf|basar)|christmas[- ]?market',
    months: ['10', '11', '12', '01'],
  },
  christmas: {
    pattern: 'weihnacht|christmas|advent(?!ur)|krampus|perchten|nikolaus(feier|fest|besuch|umzug|markt)|nikolo',
    months: ['10', '11', '12', '01'],
  },
  halloween: {
    pattern: 'halloween|hallowe[’\x27]en|gruselfest|gruselparty',
    months: ['10', '11'],
  },
  new_year: {
    pattern: 'silvester|neujahr|new year',
    months: ['12', '01'],
  },
  valentine: {
    pattern: 'valentinstag|valentins(feier|fest|konzert|dinner|brunch|ball|workshop)|valentine([’\x27]s|s)?[- ]?(day|party|dinner|concert|brunch|workshop)',
    months: ['02'],
  },
  easter: {
    pattern: '(^|[^a-zäöüß])(ostern|oster[- ]?(markt|märkte|maerkte|fest|feier|ferien|bastel|suche|eier|hase|hasen|brunch|konzert|messe|wanderung|zauber|pfad|werkstatt))|(^|[^a-z])easter([^a-z]|$)',
    months: ['02', '03', '04'],
  },
  fasching: {
    pattern: 'fasching|fasnacht|fastnacht|fassenacht|karneval',
    months: ['01', '02', '03'],
  },
};

const matchers = Object.fromEntries(Object.entries(SEASONAL_THEMES).map(([key, theme]) => [key, new RegExp(theme.pattern, 'i')]));

// The public query parameter stays `theme`, with comma-separated OR choices.
export function parseSeasonalThemes(raw) {
  const keys = raw ? raw.split(',').map((key) => key.trim()) : [];
  return keys.every((key) => Object.hasOwn(SEASONAL_THEMES, key)) ? [...new Set(keys)] : null;
}

export function seasonalTheme(event) {
  return Object.keys(SEASONAL_THEMES).find((key) => matchesSeasonalTheme(event, key)) || null;
}

export function matchesSeasonalTheme(event, key) {
  const theme = Object.hasOwn(SEASONAL_THEMES, key) ? SEASONAL_THEMES[key] : null;
  if (!theme || !event || event.kind === 'place' || !event.starts_at) return false;
  return theme.months.includes(event.starts_at.slice(5, 7))
    && matchers[key].test(event.title || '')
    && (key !== 'christmas' || !matchers.christmas_market.test(event.title || ''));
}

function shiftDate(day, offset) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// Gregorian Easter (Meeus/Jones/Butcher), shared by the Austrian spring seasons.
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Promotion windows are editorial, not event facts. Callers supply Vienna's date.
// Expiring a chip never deletes an event or changes its historical theme.
export function seasonalWindow(key, today) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const winterYear = month === 1 ? year - 1 : year;
  const easter = easterSunday(year);
  const windows = {
    halloween: [`${year}-09-15`, `${year}-11-01`],
    christmas_market: [`${winterYear}-10-01`, `${winterYear + 1}-01-06`],
    christmas: [`${winterYear}-11-01`, `${winterYear + 1}-01-06`],
    new_year: [`${winterYear}-12-01`, `${winterYear + 1}-01-31`],
    valentine: [`${year}-02-01`, `${year}-02-15`],
    easter: [shiftDate(easter, -42), shiftDate(easter, 1)],
    fasching: [`${year}-01-07`, shiftDate(easter, -47)],
  };
  const window = Object.hasOwn(windows, key) ? windows[key] : null;
  return window && today >= window[0] && today <= window[1] ? { from: today, to: window[1] } : null;
}

export function activeSeasonalThemes(today) {
  return Object.keys(SEASONAL_THEMES).filter((key) => seasonalWindow(key, today));
}

// One timeout at the actual next Vienna midnight, including 23/25-hour DST days.
export function nextViennaMidnight(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vienna' }).format(now);
  const midnight = new Date(`${shiftDate(today, 1)}T00:00:00Z`);
  const offset = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Vienna', timeZoneName: 'longOffset' })
    .formatToParts(midnight).find((part) => part.type === 'timeZoneName').value;
  return Date.parse(`${shiftDate(today, 1)}T00:00:00${offset.slice(3)}`);
}
