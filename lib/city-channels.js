// City/area channel registry for the weekly growth engine (newsletter + social).
// One entry per city-named handle (okolo.linz, okolo.wien, …) — the strategy in
// docs/strategy/growth-and-social.md §2 proved out per-city handles, so adding a
// city to the motion is adding a row here, nothing else. Channels are ordered by
// rollout priority: Linz is the validation-test city and always leads.
//
// `radiusKm` is the catchment for picks + subscriber matching ("rund um Linz"),
// not a market claim. `lang` drives newsletter/caption language (hard ask from
// George: local language — German in Austria, Bulgarian in Bulgaria).

export const CHANNELS = [
  { slug: 'linz',      label: 'Linz',      handle: 'okolo.linz',      lat: 48.3069, lng: 14.2858, radiusKm: 40, lang: 'de', country: 'AT', tz: 'Europe/Vienna',
    hashtags: ['#linz', '#linzmitkindern', '#oberösterreich', '#familienausflug', '#wasistlosinlinz', '#linzwochenende'] },
  { slug: 'wien',      label: 'Wien',      handle: 'okolo.wien',      lat: 48.2082, lng: 16.3738, radiusKm: 40, lang: 'de', country: 'AT', tz: 'Europe/Vienna',
    hashtags: ['#wien', '#wienmitkindern', '#familienwien', '#wasistlosinwien', '#wochenendeinwien'] },
  { slug: 'graz',      label: 'Graz',      handle: 'okolo.graz',      lat: 47.0707, lng: 15.4395, radiusKm: 40, lang: 'de', country: 'AT', tz: 'Europe/Vienna',
    hashtags: ['#graz', '#grazmitkindern', '#steiermark', '#familienausflug', '#grazwochenende'] },
  { slug: 'salzburg',  label: 'Salzburg',  handle: 'okolo.salzburg',  lat: 47.8095, lng: 13.0550, radiusKm: 40, lang: 'de', country: 'AT', tz: 'Europe/Vienna',
    hashtags: ['#salzburg', '#salzburgmitkindern', '#familienausflug', '#salzburgerland'] },
  { slug: 'innsbruck', label: 'Innsbruck', handle: 'okolo.innsbruck', lat: 47.2692, lng: 11.4041, radiusKm: 40, lang: 'de', country: 'AT', tz: 'Europe/Vienna',
    hashtags: ['#innsbruck', '#innsbruckmitkindern', '#tirol', '#familienausflug'] },
  { slug: 'sofia',     label: 'София',     handle: 'okolo.sofia',     lat: 42.6977, lng: 23.3219, radiusKm: 40, lang: 'bg', country: 'BG', tz: 'Europe/Sofia',
    hashtags: ['#софия', '#софиясдеца', '#събитиясофия', '#уикендсофия', '#sofia'] },
  { slug: 'plovdiv',   label: 'Пловдив',   handle: 'okolo.plovdiv',   lat: 42.1354, lng: 24.7453, radiusKm: 35, lang: 'bg', country: 'BG', tz: 'Europe/Sofia',
    hashtags: ['#пловдив', '#пловдивсдеца', '#събитияпловдив', '#plovdiv'] },
  { slug: 'varna',     label: 'Варна',     handle: 'okolo.varna',     lat: 43.2141, lng: 27.9147, radiusKm: 35, lang: 'bg', country: 'BG', tz: 'Europe/Sofia',
    hashtags: ['#варна', '#варнасдеца', '#събитияварна', '#varna'] },
  { slug: 'burgas',    label: 'Бургас',    handle: 'okolo.burgas',    lat: 42.5048, lng: 27.4626, radiusKm: 35, lang: 'bg', country: 'BG', tz: 'Europe/Sofia',
    hashtags: ['#бургас', '#бургассдеца', '#събитиябургас', '#burgas'] },
  { slug: 'stuttgart', label: 'Stuttgart', handle: 'okolo.stuttgart', lat: 48.7758, lng: 9.1829,  radiusKm: 40, lang: 'de', country: 'DE', tz: 'Europe/Berlin',
    hashtags: ['#stuttgart', '#stuttgartmitkindern', '#familienausflug', '#stuttgartwochenende'] },
];

export function getChannel(slug) {
  return CHANNELS.find((c) => c.slug === slug) || null;
}

// Upcoming weekend in the channel's timezone, as date-only local strings
// (starts_at is stored as local wall-clock TEXT, so string compare is exact).
// Mon–Thu → the coming Fri–Sun; Fri–Sun → the CURRENT weekend from today
// (a Saturday digest should say what's still on, not next week).
export function weekendWindow(tz, now = new Date()) {
  const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now); // YYYY-MM-DD
  const dow = new Date(`${dayStr}T12:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat, date-only so tz-safe
  const addDays = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const toFriday = dow === 0 ? -2 : 5 - dow; // Sun → back to Fri; else forward to Fri
  const friday = addDays(dayStr, toFriday);
  const sunday = addDays(friday, 2);
  const from = dow === 6 || dow === 0 ? dayStr : friday; // mid-weekend: don't list finished days
  return { from, to: sunday, friday, sunday };
}

// "11.–13. Juli" / "11–13 юли" style label for covers, subjects, captions.
export function weekendLabel({ friday, sunday }, lang) {
  const locale = lang === 'bg' ? 'bg-BG' : 'de-AT';
  const f = new Date(`${friday}T12:00:00Z`);
  const s = new Date(`${sunday}T12:00:00Z`);
  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const sameMonth = f.getUTCMonth() === s.getUTCMonth();
  if (lang === 'bg') {
    return sameMonth
      ? `${f.getUTCDate()}–${s.getUTCDate()} ${month.format(s)}`
      : `${f.getUTCDate()} ${month.format(f)} – ${s.getUTCDate()} ${month.format(s)}`;
  }
  return sameMonth
    ? `${f.getUTCDate()}.–${s.getUTCDate()}. ${month.format(s)}`
    : `${f.getUTCDate()}. ${month.format(f)} – ${s.getUTCDate()}. ${month.format(s)}`;
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Nearest channel whose catchment contains the point, or null. Used to route a
// newsletter subscriber's chosen locality to a city digest.
export function channelForPoint(lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const c of CHANNELS) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d <= c.radiusKm && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
