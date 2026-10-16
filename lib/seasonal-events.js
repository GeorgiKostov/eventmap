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
};

const matchers = Object.fromEntries(Object.entries(SEASONAL_THEMES).map(([key, theme]) => [key, new RegExp(theme.pattern, 'i')]));

export function seasonalTheme(event) {
  return Object.keys(SEASONAL_THEMES).find((key) => matchesSeasonalTheme(event, key)) || null;
}

export function matchesSeasonalTheme(event, key) {
  const theme = SEASONAL_THEMES[key];
  if (!theme || !event || event.kind === 'place' || !event.starts_at) return false;
  return theme.months.includes(event.starts_at.slice(5, 7))
    && matchers[key].test(event.title || '')
    && (key !== 'christmas' || !matchers.christmas_market.test(event.title || ''));
}

// Caller supplies Vienna's date, keeping host timezone out of the preset.
export function holidayWindow(today) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return { from: today, to: `${month === 1 ? year : year + 1}-01-31` };
}
