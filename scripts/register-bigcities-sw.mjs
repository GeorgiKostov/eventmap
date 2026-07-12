// One-off: register event sources for the south/west Austrian big cities that
// have ~zero registered crawl sources despite being population centers — they
// run custom city event portals, not the small-town GEM2GO municipal-calendar
// CMS most of our 270+ existing Austrian sources use.
// Cities: Graz, Salzburg (city), Innsbruck, Klagenfurt am Wörthersee, Villach,
// Wels, Steyr, Leoben, Wolfsberg, Kapfenberg (Wels/Steyr already had one
// GEM2GO-ish source each; this adds depth + family-specific publishers).
//
// Every URL below was verified live + robots.txt-allowed (no named-AI-bot
// blocks) by hand/agent before this list was written — see session notes /
// final report. None of these sites expose JSON-LD Event data or iCal/RSS in
// a form our generic parsers can use (one exception: wissenswertwelt.at,
// which DOES carry real schema.org/Event JSON-LD — $0 route), so nearly
// everything here routes through the LLM fallback (lib/extract.js) rather
// than a cms-gated deterministic parser, same posture as Wien's WIENXTRA/MQW.
//
// Usage: node --env-file=.env.local scripts/register-bigcities-sw.mjs         (dry run)
//        node --env-file=.env.local scripts/register-bigcities-sw.mjs --write
import { upsertSource, listSourcesForDedup, closeDb } from '../lib/db.js';

const SOURCES = [
  // --- Graz (Steiermark) ---
  {
    name: 'Kulturserver Graz — Kalender', url: 'https://kultur.graz.at/kalender/',
    kind: 'city_calendar', cms: null, town: 'Graz', region: 'Steiermark',
    notes: 'Official Graz city cultural calendar. robots.txt: allow all, crawl-delay 2. '
      + 'No JSON-LD/iCal/RSS on the HTML page itself — LLM fallback. The RSS feeds below '
      + '(kultur.graz.at/kalender_rss/*.xml) are the same underlying data as a structured '
      + 'feed; keep both — the HTML page catches anything the RSS misses.',
  },
  {
    name: 'Kulturserver Graz — RSS Kinder/Jugend (30 Tage)',
    url: 'https://kultur.graz.at/kalender_rss/ksv3_30tage_kinderjugend.xml',
    kind: 'open_data', cms: null, town: 'Graz', region: 'Steiermark',
    notes: 'CC-BY 4.0 (data.gv.at dataset f36e3404-c711-4f35-8312-757d6a6691f2, catalog UI page '
      + 'itself 404s but the feed is live). Non-standard RDF/RSS 1.0 dialect: ONE <item> per feed '
      + 'containing ALL events crammed into one HTML-escaped description blob (dates like '
      + '"12.07. 11:00 <a>Title</a>, Venue, bis 13.07."), not one <item> per event with a dtstart '
      + 'tag — so crawl.mjs\'s generic parseRssEvents() gate (requires an explicit event-date tag '
      + 'per item) will not fire; falls to LLM fallback on a small, dense, well-structured page. '
      + 'Good future custom-parser target (mirrors Wien\'s non-standard JSON-LD dialect needing a '
      + 'dedicated parser) — flagged for the Architect, not written here per crawl.mjs no-touch rule.',
  },
  {
    name: 'Kulturserver Graz — RSS alle Kategorien (30 Tage)',
    url: 'https://kultur.graz.at/kalender_rss/ksv3_30tage.xml',
    kind: 'open_data', cms: null, town: 'Graz', region: 'Steiermark',
    notes: 'Same dialect/license/parser situation as the Kinder/Jugend feed above, all categories.',
  },
  {
    name: 'Graz Tourismus — Event Calendar', url: 'https://www.graztourismus.at/en/events/event-calendar',
    kind: 'regional_feed', cms: null, town: 'Graz', region: 'Steiermark',
    notes: 'Graz Tourismus (THE Graz tourism board). robots.txt only blocks pimcore_preview/ '
      + 'tracking params, no AI-bot block. LLM fallback (no structured feed found).',
  },
  {
    name: 'Graz Tourismus — Kids & Families',
    url: 'https://www.graztourismus.at/en/events/event-calendar/kids-families',
    kind: 'regional_feed', cms: null, town: 'Graz', region: 'Steiermark',
    notes: 'Same site/robots as above, pre-filtered to family/kids events — families-first angle.',
  },
  {
    name: 'Stadtbibliothek Graz — Veranstaltungen', url: 'https://stadtbibliothek.graz.at/Veranstaltungen',
    kind: 'regional_feed', cms: null, town: 'Graz', region: 'Steiermark',
    notes: 'Public library events (children\'s programs incl. LABUKA library-island week). '
      + 'robots.txt: only CMS admin paths blocked, no AI-bot block. LLM fallback.',
  },
  {
    name: 'FRida & freD Kindermuseum — Termine', url: 'https://fridaundfred.at/en/termine/',
    kind: 'regional_feed', cms: null, town: 'Graz', region: 'Steiermark',
    notes: 'Graz\'s children\'s museum. robots.txt: Yoast default, allow all. LLM fallback.',
  },

  // --- Salzburg (city, not the Land) ---
  {
    name: 'Stadt Salzburg — Termine', url: 'https://www.stadt-salzburg.at/termine/',
    kind: 'city_calendar', cms: null, town: 'Salzburg', region: 'Salzburg',
    notes: 'Official Salzburg city calendar (distinct from the already-registered '
      + '"Gemeinde Salzburg" /kultur page). robots.txt: allow all besides /analyse/. LLM fallback.',
  },
  {
    name: 'Salzburg.info — Events Calendar', url: 'https://www.salzburg.info/en/events/events-calendar',
    kind: 'regional_feed', cms: null, town: 'Salzburg', region: 'Salzburg',
    notes: 'Salzburg Tourismus, THE major Salzburg tourism site. robots.txt: allow all. '
      + 'LLM fallback; note some entries are ticketed commercial concerts, not just civic events.',
  },
  {
    name: 'Haus der Natur — Kinder & Familie',
    url: 'https://www.hausdernatur.at/de/veranstaltungen-kinder-familie.html',
    kind: 'regional_feed', cms: null, town: 'Salzburg', region: 'Salzburg',
    notes: 'Salzburg\'s science/nature museum, dedicated kids/family events page. robots.txt: '
      + 'only /contao/ admin blocked. LLM fallback.',
  },

  // --- Innsbruck (Tirol) ---
  {
    name: 'Innsbrucktermine.at', url: 'https://www.innsbrucktermine.at/en',
    kind: 'city_calendar', cms: null, town: 'Innsbruck', region: 'Tirol',
    notes: 'Innsbruck Marketing GmbH\'s events platform — the site innsbruck.gv.at itself '
      + 'links to as the authoritative event source (de-facto official). robots.txt: only '
      + '/neos/ (CMS admin) blocked. Only a page-level WebPage JSON-LD (not Event-typed) — '
      + 'LLM fallback.',
  },
  {
    name: 'Innsbrucktermine.at — Familie & Kinder',
    url: 'https://www.innsbrucktermine.at/en/c/familie/kinder-familienveranstaltungen',
    kind: 'city_calendar', cms: null, town: 'Innsbruck', region: 'Tirol',
    notes: 'Same site/robots as above, pre-filtered to family/kids events.',
  },
  {
    name: 'Innsbruck.info — Events', url: 'https://www.innsbruck.info/events.html',
    kind: 'regional_feed', cms: null, town: 'Innsbruck', region: 'Tirol',
    notes: 'Innsbruck Tourismus. robots.txt: session-id/pdf/kiosk/webcam paths blocked, no '
      + 'AI-bot block. Has a "Familie" filter category. LLM fallback (no structured feed found).',
  },
  {
    name: 'Stadtbibliothek Innsbruck — Veranstaltungskalender',
    url: 'https://stadtbibliothek.innsbruck.gv.at/de/programm/veranstaltungskalender/5-0.html',
    kind: 'regional_feed', cms: null, town: 'Innsbruck', region: 'Tirol',
    notes: 'City library, children\'s workshop programs. robots.txt: only /pfengine/, /tracking/, '
      + '/default/ (non-asset) blocked. LLM fallback; expect low volume (thin listing).',
  },

  // --- Klagenfurt am Wörthersee (Kärnten) ---
  // NOTE: our DB's canonical town-name value for this city is the full form
  // "Klagenfurt am Wörthersee", not bare "Klagenfurt" — matched here.
  {
    name: 'Stadt Klagenfurt — Veranstaltungen', url: 'https://www.klagenfurt.at/stadtinfo/veranstaltungen',
    kind: 'city_calendar', cms: null, town: 'Klagenfurt am Wörthersee', region: 'Kärnten',
    notes: 'Official city calendar, but thin — a curated static list that itself defers to '
      + 'visitklagenfurt.at for the real calendar. visitklagenfurt.at is a JS-rendered SPA '
      + '(plain fetch returns no event dates) so it was not registered here; worth a headless-'
      + 'render follow-up. robots.txt: allow all, no AI-bot block. LLM fallback.',
  },
  {
    name: 'Mein Klagenfurt — Eventkalender',
    url: 'https://mein-klagenfurt.at/mein-klagenfurt/events-veranstaltungen/eventkalender-klagenfurt-am-woerthersee',
    kind: 'regional_feed', cms: null, town: 'Klagenfurt am Wörthersee', region: 'Kärnten',
    notes: 'Community "Großstadt-Magazin" aggregator, not an official city/tourism source — '
      + 'labeled non-official per the "don\'t label curated/public sources as community-'
      + 'submitted" lesson (this is genuinely third-party, the opposite case). Confirmed live, '
      + 'real dated events. robots.txt: allow all besides /dev/. LLM fallback.',
  },
  {
    name: 'wissenswertwelt — Veranstaltungen', url: 'https://wissenswertwelt.at/veranstaltungen/',
    kind: 'regional_feed', cms: null, town: 'Klagenfurt am Wörthersee', region: 'Kärnten',
    notes: 'Kids science center. BEST source found this batch: genuine schema.org/Event JSON-LD '
      + 'on the page ($0 route via parseJsonLdEvents) — confirmed via direct fetch (@type: Event, '
      + '"Reef Rescue" etc). Also carries a webcal iCal link as a second structured route. '
      + 'robots.txt: only /wp-admin/ blocked. Register the base /veranstaltungen/ page, not a '
      + 'month-specific URL (which would go stale).',
  },

  // --- Villach (Kärnten) ---
  {
    name: 'Stadt Villach — Veranstaltungen', url: 'https://www.villach.at/stadt-erleben/veranstaltungen',
    kind: 'city_calendar', cms: null, town: 'Villach', region: 'Kärnten',
    notes: 'Official city calendar, confirmed real dated content via plain fetch. robots.txt: '
      + 'only Page-Templates/Development/Social-icons/Import/intranet admin paths blocked. '
      + 'LLM fallback. visitvillach.at (tourism board) is JS-rendered (0 dates in plain fetch) '
      + 'so it was skipped — follow-up candidate for headless rendering.',
  },
  {
    name: 'Villach Kindertheater', url: 'https://www.villach.at/stadt-erleben/kultur/kindertheater2024-25',
    kind: 'regional_feed', cms: null, town: 'Villach', region: 'Kärnten',
    notes: 'City\'s own children\'s theater season program page (PDF/Issuu embed + text). Same '
      + 'domain/robots as above. LLM fallback; expect low/seasonal yield between season updates.'
      + ' Villach is thin overall (only 2 sources found) — a city library or Congress Center '
      + 'calendar would be good follow-up candidates (both checked, came back JS-rendered/empty '
      + 'in plain fetch this pass).',
  },

  // --- Wolfsberg (Kärnten) ---
  {
    name: 'Stadt Wolfsberg — Event Calendar',
    url: 'https://www.wolfsberg.at/event-calendars/65c09e97f536d8570e7ea15e',
    kind: 'city_calendar', cms: null, town: 'Wolfsberg', region: 'Kärnten',
    notes: 'Official city calendar widget, confirmed real dated content via plain fetch '
      + '("CITIES platform" widget — an underlying JSON API likely exists, not investigated). '
      + 'robots.txt: allow all. LLM fallback. tourismus-wolfsberg.at and region-lavanttal.at were '
      + 'checked and skipped: both render their event lists via an iframe/JS with no dates '
      + 'visible in a plain fetch (0 date matches).',
  },
  {
    name: 'Schloss Wolfsberg — Veranstaltungen', url: 'https://schloss-wolfsberg.at/veranstaltungen-1.html',
    kind: 'regional_feed', cms: null, town: 'Wolfsberg', region: 'Kärnten',
    notes: 'City\'s own Kultur department runs this castle/cultural venue (contact '
      + 'kultur@wolfsberg.at) — confirmed real dated exhibitions/tours. robots.txt: only /admin, '
      + '/captcha, /menu, /imemail blocked. LLM fallback. Wolfsberg is thin overall (2 sources) — '
      + 'flag for follow-up.',
  },

  // --- Leoben (Steiermark) ---
  {
    name: 'Stadt Leoben — Veranstaltungen', url: 'https://www.leoben.at/veranstaltungen/',
    kind: 'city_calendar', cms: null, town: 'Leoben', region: 'Steiermark',
    notes: 'Official city calendar, confirmed real dated events. robots.txt: Yoast default, '
      + 'allow all. LLM fallback. tourismus-leoben.at is Cloudflare bot-walled (403 on every '
      + 'request including robots.txt itself) — skipped as inaccessible, not a robots-policy '
      + 'skip. A shared "steiermark.com/Hochsteiermark" regional tourism page also covers '
      + 'Leoben+Kapfenberg but was deliberately NOT registered: it is genuinely multi-town and '
      + 'crawl.mjs\'s LLM-fallback prompt primes the model with a single "Gemeinde ${town}" hint '
      + '(lib/extract.js) — registering it under one town risked mislabeling the other town\'s '
      + 'events (the exact town-mislabeling failure class this task warned about). Worth revisiting '
      + 'with town left null once per-event town-extraction reliability is verified.',
  },
  {
    name: 'Junges Museum Leoben — Termine',
    url: 'https://kulturquartier.leoben.at/museum/junges-museum/termine/',
    kind: 'regional_feed', cms: null, town: 'Leoben', region: 'Steiermark',
    notes: 'Children\'s museum, confirmed real dated content via plain fetch (contrary to an '
      + 'initial "renders via JS" concern — verified otherwise). robots.txt: Yoast default, '
      + 'allow all. LLM fallback.',
  },
  {
    name: 'Stadtbibliothek Leoben', url: 'https://kulturquartier.leoben.at/stadtbibliothek/',
    kind: 'regional_feed', cms: null, town: 'Leoben', region: 'Steiermark',
    notes: 'Same domain/robots as the Junges Museum above. Describes an ongoing kids\' '
      + 'storytelling/workshop program without an explicit dated list in the fetched page — '
      + 'LLM fallback, expect low/uncertain yield.',
  },

  // --- Kapfenberg (Steiermark) ---
  {
    name: 'events.kapfenberg.at', url: 'https://events.kapfenberg.at/',
    kind: 'city_calendar', cms: null, town: 'Kapfenberg', region: 'Steiermark',
    notes: 'Official city events portal (contact events@kapfenberg.gv.at), confirmed real dated '
      + 'events incl. family event "Kinderstadt Freitopia". robots.txt: only /wp-admin/ blocked '
      + '(admin-ajax explicitly allowed). LLM fallback. Tourismusverband Kapfenberg\'s own site '
      + 'has a dead "#" placeholder for its events nav link — no functioning calendar to register, '
      + 'not a robots-policy skip.',
  },
  {
    name: 'Burg Oberkapfenberg — Kalender',
    url: 'http://www.burg-oberkapfenberg.at/content/kalender_show.php',
    kind: 'regional_feed', cms: null, town: 'Kapfenberg', region: 'Steiermark',
    notes: 'Family castle (falconry, knights\' festival — 25th Ritterfest anniversary 2026), '
      + 'confirmed real dated content via plain fetch (http, not https — the https/www variant '
      + 'timed out; use this exact URL). robots.txt: Allow: / (no AI-bot block). LLM fallback. '
      + 'Kapfenberg is thin overall (only 2 independently viable sources found after checking the '
      + 'ISGS 2026 family program page and Tourismusverband Kapfenberg, neither of which yielded '
      + 'confirmed dated events in a plain fetch) — flag loudly for follow-up.',
  },
];

async function main() {
  const write = process.argv.includes('--write');
  const existing = await listSourcesForDedup();
  const existingUrls = new Set(existing.map((s) => s.url));

  console.log(`${SOURCES.length} candidate sources. ${write ? 'WRITING' : 'DRY RUN (pass --write to apply)'}\n`);
  const byTown = {};
  for (const s of SOURCES) {
    byTown[s.town] = (byTown[s.town] || 0) + 1;
    const already = existingUrls.has(s.url);
    // Skip sources already registered — re-running must NOT flip works=true on a
    // source the crawler has since marked dead, nor clobber crawler-updated
    // cms/notes. Only genuinely new sources are inserted (matches register-bigcities-e).
    console.log(`${already ? '[skip]  ' : '[new]   '} [${s.town}] ${s.name} — ${s.url}`);
    if (write && !already) {
      await upsertSource({ ...s, country: 'AT', works: true });
    }
  }
  console.log('\nPer town:', JSON.stringify(byTown, null, 2));
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
