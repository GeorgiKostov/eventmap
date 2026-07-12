// One-off: register big-city event sources for the eastern-Austria +
// Vienna-deepening pass (task: "big cities east + Vienna DEEP").
// Big cities (Sankt Pölten, Wiener Neustadt, Krems an der Donau, Baden,
// Dornbirn, Feldkirch, Bregenz, Kufstein, Eisenstadt) run custom city event
// portals, not GEM2GO — near-zero prior coverage. Plus additional
// family-relevant Vienna sources beyond the first pass (wien.gv.at,
// WIENXTRA, MuseumsQuartier).
//
// Every URL below was verified live + robots-allowed by hand before this
// list was written (see session notes / final report).
//
// Usage: node --env-file=.env.local scripts/register-bigcities-e.mjs
//          (dry run: prints the plan, no writes)
//        node --env-file=.env.local scripts/register-bigcities-e.mjs --write
import { listSourcesForDedup, upsertSource, closeDb } from '../lib/db.js';

const SOURCES = [
  // ---- Vienna deepening (region: Wien) ----
  {
    name: 'Wien Museum — Kalender',
    url: 'https://www.wienmuseum.at/kalender',
    town: 'Wien', region: 'Wien', kind: 'regional_feed', cms: null,
    notes: 'City history museum, free permanent exhibition + extensive kids/family '
      + 'program (Ferienspiel, Atelier workshops). 150+ dated events at probe time, '
      + 'no JSON-LD/iCal/RSS — LLM fallback. robots.txt absent (no restrictions).',
  },
  {
    name: 'Tiergarten Schönbrunn — Termine',
    url: 'https://www.zoovienna.at/termine/',
    town: 'Wien', region: 'Wien', kind: 'regional_feed', cms: null,
    notes: 'Vienna zoo events (Safari Dinner, Polarnacht, seasonal programs). No '
      + 'JSON-LD/iCal/RSS — LLM fallback. robots.txt allows all except a defunct '
      + '"Ezooms" bot.',
  },
  {
    name: 'Dschungel Wien — Spielplan',
    url: 'https://www.dschungelwien.at/spielplan',
    town: 'Wien', region: 'Wien', kind: 'regional_feed', cms: null,
    notes: 'Children/youth theater in the MuseumsQuartier — 50+ productions/season. '
      + 'First Vienna pass hit a technical block; retried and the /spielplan path '
      + 'renders full server-side HTML with per-day listings (only /*?* query-param '
      + 'URLs and /contao/ are blocked in robots.txt, not this path). No JSON-LD — '
      + 'LLM fallback.',
  },
  {
    name: 'Kultursommer Wien — Kinderprogramm',
    url: 'https://www.kultursommer.wien/programm/kinderprogramm',
    town: 'Wien', region: 'Wien', kind: 'regional_feed', cms: null,
    notes: 'Free open-air summer festival (Jul 2 – Aug 16), dedicated kids-morning-show '
      + 'strand across 11 park venues. Clean dated listing, no JSON-LD — LLM fallback. '
      + 'robots.txt absent (no restrictions).',
  },
  {
    name: 'Haus des Meeres — Veranstaltungskalender',
    url: 'https://www.haus-des-meeres.at/events-kultur/veranstaltungskalender',
    town: 'Wien', region: 'Wien', kind: 'regional_feed', cms: null,
    notes: 'Aqua-terra zoo, family-heavy programming (feedings, Kulturwelle concerts, '
      + 'talks). No JSON-LD — LLM fallback. robots.txt allows all.',
  },

  // ---- Sankt Pölten (Niederösterreich) ----
  {
    name: 'St. Pölten — Veranstaltungskalender (VADB)',
    url: 'https://events.st-poelten.at/',
    town: 'Sankt Pölten', region: 'Niederösterreich', kind: 'city_calendar', cms: null,
    notes: 'Official city calendar (VADB/vadb.niederoesterreich.at backend — same platform as '
      + 'Wiener Neustadt/Krems). No JSON-LD/RSS — LLM fallback. robots.txt allows all except '
      + 'preview/print/report query paths.',
  },
  {
    name: 'Kids & Co St. Pölten — Eltern-Kind-Zentrum (Familienbund NÖ)',
    url: 'https://kidsundco-stpoelten.jimdofree.com/',
    town: 'Sankt Pölten', region: 'Niederösterreich', kind: 'municipal', cms: null,
    notes: 'Parent-child center, actively maintained. CAVEAT: course dates live mainly inside a '
      + 'downloadable PDF booklet, not page HTML — verify actual crawl yield, may under-extract.',
  },

  // ---- Wiener Neustadt (Niederösterreich) ----
  {
    name: 'Wiener Neustadt — Veranstaltungskalender (dedicated events portal)',
    url: 'https://events.wnonline.at/',
    town: 'Wiener Neustadt', region: 'Niederösterreich', kind: 'city_calendar', cms: null,
    notes: 'Primary/richest live calendar (VADB-family backend), list/grid/map views incl. a '
      + '"family-friendly" filter icon. No JSON-LD — LLM fallback. robots.txt allows all except '
      + 'preview/print/report paths.',
  },
  {
    name: 'Wiener Alpen — Wiener Neustadt Kulturveranstaltungen',
    url: 'https://www.wieneralpen.at/wiener-neustadt/kulturveranstaltungen',
    town: 'Wiener Neustadt', region: 'Niederösterreich', kind: 'tourism', cms: 'typo3',
    notes: 'Regional tourism board (Wiener Alpen) covering Wiener Neustadt; renders live '
      + 'listings distinct from the events portal. No JSON-LD — LLM fallback. robots allows all.',
  },
  {
    name: 'Museum St. Peter an der Sperr — Kinder und Familien',
    url: 'https://www.museum-wn.at/de/konzerte-veranstaltungen/kinder-und-familien',
    town: 'Wiener Neustadt', region: 'Niederösterreich', kind: 'municipal', cms: null,
    notes: 'City museum dedicated kids page, cooperates with ZOOM Kindermuseum Wien. CAVEAT: '
      + 'thin at probe time (one forward-dated item) — low-volume source, verify yield.',
  },

  // ---- Krems an der Donau (Niederösterreich) ----
  {
    name: 'Krems an der Donau — Veranstaltungskalender (VADB)',
    url: 'https://events.krems.at/',
    town: 'Krems an der Donau', region: 'Niederösterreich', kind: 'city_calendar', cms: null,
    notes: 'Strongest single source for Krems — confirmed family-tagged events (e.g. '
      + '"Familienführung Landesgalerie"). No JSON-LD — LLM fallback. robots allows all except '
      + 'preview/print/report paths.',
  },
  {
    name: 'Kunstmeile Krems — Programm/Veranstaltungen (Kinder.Kunst.Klub, Familienführungen)',
    url: 'https://www.kunstmeile.at/de/programm/veranstaltungen',
    town: 'Krems an der Donau', region: 'Niederösterreich', kind: 'municipal', cms: null,
    notes: 'Multi-venue museum mile (Karikaturmuseum/Landesgalerie/Kunsthalle), recurring '
      + 'monthly Familienführung + Family Factory open studio. Heavy client-rendered listing — '
      + 'verify actual crawl yield, may need per-event-page extraction. No robots.txt (404, '
      + 'default-allow).',
  },

  // ---- Baden bei Wien (Niederösterreich) ----
  {
    name: 'Stadtgemeinde Baden — Veranstaltungen',
    url: 'https://www.baden.at/Genuss/Veranstaltungen',
    town: 'Baden bei Wien', region: 'Niederösterreich', kind: 'city_calendar', cms: null,
    notes: 'Official city calendar (custom ASP.NET). No JSON-LD — LLM fallback. robots.txt fully '
      + 'open (only Sitemap/Crawl-delay, no Disallow).',
  },
  {
    name: 'Tourismus Baden — Veranstaltungen (Wienerwald regional portal)',
    url: 'https://www.wienerwald.info/baden/veranstaltungen',
    town: 'Baden bei Wien', region: 'Niederösterreich', kind: 'tourism', cms: 'typo3',
    notes: 'CORRECTED URL (2026-07-12): tourismus.baden.at/veranstaltungen-3 as originally found '
      + 'by research now 404s — the whole tourismus.baden.at domain now redirects to the regional '
      + 'wienerwald.info/baden portal. Live-verified with dated 2026 events (Adventzauber, Anatol, '
      + 'Andreas Vitásek). No JSON-LD — LLM fallback. robots allows all except query-param/TYPO3 '
      + 'admin paths.',
  },
  {
    name: 'Bühne Baden — Kalender (Stadttheater)',
    url: 'https://www.buehnebaden.at/de/kalender',
    town: 'Baden bei Wien', region: 'Niederösterreich', kind: 'municipal', cms: null,
    notes: 'Only source across the NÖ batch with a confirmed per-event iCalendar (.ics) export — '
      + 'should resolve via the iCal route, not LLM. Mostly adult theater programming, occasional '
      + 'youth workshops. No robots.txt (default-allow).',
  },
  {
    name: 'Kids & Co Baden — Eltern-Kind-Zentrum (Familienbund NÖ)',
    url: 'https://kidsundco-baden.at/',
    town: 'Baden bei Wien', region: 'Niederösterreich', kind: 'municipal', cms: null,
    notes: 'Semiannual family-center program. CAVEAT: course dates live mainly in downloadable '
      + 'PDF/flipbook program booklets, not page HTML — verify actual crawl yield.',
  },

  // ---- Dornbirn (Vorarlberg) ----
  {
    name: 'Dornbirn Tourismus & Stadtmarketing — Events (de facto city calendar)',
    url: 'https://www.dornbirn.info/de/events',
    town: 'Dornbirn', region: 'Vorarlberg', kind: 'city_calendar', cms: null,
    notes: "dornbirn.at's own Veranstaltungen nav redirects here — this IS the city calendar. "
      + 'No JSON-LD/ICS/RSS — LLM fallback. robots.txt fully open.',
  },
  {
    name: 'Familienzentrum Dornbirn — Veranstaltungen',
    url: 'https://familienzentrum.dornbirn.at/veranstaltungen',
    town: 'Dornbirn', region: 'Vorarlberg', kind: 'municipal', cms: 'typo3',
    notes: "City-run family center's own child/family services calendar — strong family signal, "
      + 'confirmed recurring dated listings. No JSON-LD — LLM fallback. robots allows all except '
      + 'ia_archiver/private TYPO3 paths.',
  },
  {
    name: 'inatura Erlebnis Naturschau Dornbirn — Veranstaltungsprogramm',
    url: 'https://www.inatura.at/veranstaltungen/veranstaltungsprogramm',
    town: 'Dornbirn', region: 'Vorarlberg', kind: 'municipal', cms: 'typo3',
    notes: "Vorarlberg's natural history museum, strongly child-programmed (e.g. Kindersommer). "
      + 'Only BreadcrumbList JSON-LD (no Event type) — LLM fallback. robots allows all except '
      + 'ia_archiver/private TYPO3 paths.',
  },
  {
    name: 'Kulturhaus Dornbirn — Veranstaltungen',
    url: 'https://www.kulturhaus-dornbirn.at/veranstaltungen',
    town: 'Dornbirn', region: 'Vorarlberg', kind: 'city_calendar', cms: null,
    notes: "City's main cultural venue, 61 dated events at probe time — general-audience, not "
      + 'family-specific, but a solid volume source. No JSON-LD — LLM fallback. robots allows all.',
  },

  // ---- Feldkirch (Vorarlberg) ----
  {
    name: 'Feldkirch — Eventkalender (feldkirch-leben.at, de facto city+tourism calendar)',
    url: 'https://feldkirch-leben.at/eventkalender',
    town: 'Feldkirch', region: 'Vorarlberg', kind: 'city_calendar', cms: 'typo3',
    notes: "Both feldkirch.at nav links TYPO3-redirect here — this IS the combined city+tourism "
      + 'calendar. No JSON-LD — LLM fallback. No robots.txt (404, default-allow).',
  },
  {
    name: 'Montforthaus Feldkirch — Eventkalender',
    url: 'https://montforthausfeldkirch.com/de/besuchen/eventkalender',
    town: 'Feldkirch', region: 'Vorarlberg', kind: 'municipal', cms: 'contao',
    notes: "City's congress/culture house calendar. JSON-LD present but typed WebPage/ImageObject "
      + 'only (no Event type) — LLM fallback. robots allows all except /contao/ admin paths.',
  },

  // ---- Bregenz (Vorarlberg) ----
  {
    name: 'Landeshauptstadt Bregenz — Veranstaltungskalender',
    url: 'https://www.bregenz.gv.at/veranstaltungskalender',
    town: 'Bregenz', region: 'Vorarlberg', kind: 'city_calendar', cms: 'typo3',
    notes: 'Official city calendar, independent of the tourism-board site (unlike Dornbirn/'
      + 'Feldkirch, Bregenz hosts its own). No JSON-LD — LLM fallback. robots allows all except '
      + '/nc/diverses/.',
  },
  {
    name: 'Bregenz Tourismus & Stadtmarketing — Eventkalender',
    url: 'https://visitbregenz.com/events/eventkalender',
    town: 'Bregenz', region: 'Vorarlberg', kind: 'tourism', cms: 'typo3',
    notes: 'Distinct tourism-board calendar (~700 events/year incl. Bregenzer Festspiele, '
      + 'Hafenfest). Only BreadcrumbList JSON-LD — LLM fallback. robots allows all except TYPO3 '
      + 'admin internals.',
  },

  // ---- Regional (Vorarlberg family org — covers Dornbirn/Feldkirch/Bregenz, one row) ----
  {
    name: 'Vorarlberger Familienverband (Familienbund) — Veranstaltungen für Familien',
    url: 'https://familie.or.at/veranstaltungen/',
    town: null, region: 'Vorarlberg', kind: 'regional_feed', cms: null,
    notes: 'Region-wide family org (6,000+ members), per-town-tagged listings covering Dornbirn '
      + '(43 tagged), Bregenz (21 tagged), Feldkirch (9 tagged) at probe time. WordPress; a '
      + 'generic post RSS exists at /feed/ but is not event-structured — LLM fallback on the '
      + 'listing page. robots allows all except wp-admin/woocommerce.',
  },

  // ---- Kufstein (Tirol) ----
  {
    name: 'Kultur Kufstein — Veranstaltungskalender',
    url: 'https://kultur.kufstein.at/de/veranstaltungen.html',
    town: 'Kufstein', region: 'Tirol', kind: 'city_calendar', cms: null,
    notes: 'City culture calendar, server-rendered, 400+ dated events at probe time. No JSON-LD/'
      + 'RSS/ICS — LLM fallback. robots.txt allows all, sitemap declared.',
  },
  {
    name: 'Festung Kufstein — Eventkalender',
    url: 'https://www.festung.kufstein.at/de/eventkalender.html',
    town: 'Kufstein', region: 'Tirol', kind: 'tourism', cms: null,
    notes: "Kufstein's flagship family attraction (fortress) — Familienführungen, MusicalSommer, "
      + 'Weihnachtszauber confirmed live. CAVEAT: dates sit on individual event pages, not the '
      + 'listing itself — verify actual crawl yield. robots allows all, sitemap declared.',
  },
  {
    name: 'SCHUBI-DU Eltern-Kind-Zentrum Kufstein',
    url: 'https://www.schubi-du.at/',
    town: 'Kufstein', region: 'Tirol', kind: 'regional_feed', cms: 'wordpress',
    notes: 'Parent-child family center, family-relevant by definition. Fuller course calendar is '
      + 'behind a separate login-gated portal not fetchable — front page has occasional dated '
      + 'events only. robots allows all except /wp-admin/.',
  },

  // ---- Eisenstadt (Burgenland) ----
  {
    name: 'Stadt Eisenstadt — Music in the City',
    url: 'https://www.eisenstadt.gv.at/freizeit/veranstaltungskalender/music-in-the-city/',
    town: 'Eisenstadt', region: 'Burgenland', kind: 'city_calendar', cms: 'typo3',
    notes: "City's summer concert series with real dated lineup (Thu 18:30-21:00, Jul-Aug). The "
      + "parent Veranstaltungskalender overview page names events without dates — this sub-page "
      + 'is the actual live-dated source. No JSON-LD — LLM fallback. robots allows all except '
      + 'TYPO3 admin/query paths.',
  },
  {
    name: 'Schloss Esterházy — Kinderprogramm',
    url: 'https://esterhazy.at/esterhazy-kids/kinderprogramm-schloss-esterh%C3%A1zy',
    town: 'Eisenstadt', region: 'Burgenland', kind: 'tourism', cms: null,
    notes: "Eisenstadt's flagship family attraction — Schlossführung für Familien, Feenreich, "
      + 'Geistertage all confirmed live-dated. No JSON-LD — LLM fallback. robots allows all '
      + 'except /cpresources/, /vendor/, /.env, /cache/.',
  },
  {
    name: 'Haydnhaus — Sommerferien im Museum (Kinder & Familien)',
    url: 'https://haydnhaus.at/programm/kinder-familien/sommerferien-im-museum/',
    town: 'Eisenstadt', region: 'Burgenland', kind: 'municipal', cms: 'typo3',
    notes: "Haydn museum's dedicated kids/family programming, full dated summer-holiday schedule "
      + 'confirmed (age-banded workshops). No JSON-LD — LLM fallback. robots allows all except '
      + 'TYPO3 admin/query paths.',
  },
];

function parseArgs(argv) {
  return { write: argv.includes('--write') };
}

async function main() {
  const { write } = parseArgs(process.argv.slice(2));

  const existing = await listSourcesForDedup();
  const existingUrls = new Set(existing.map((s) => s.url));

  const toRegister = SOURCES.filter((s) => !existingUrls.has(s.url));
  const skipped = SOURCES.length - toRegister.length;
  console.log(`${SOURCES.length} candidate sources, ${skipped} already registered, ${toRegister.length} to register.`);

  const byRegion = {};
  for (const s of toRegister) byRegion[s.region] = (byRegion[s.region] || 0) + 1;
  console.log('Per region:', JSON.stringify(byRegion, null, 2));

  for (const s of toRegister) {
    console.log(`  [${s.region}] ${s.name} — ${s.url} (cms=${s.cms})`);
  }

  if (!write) {
    console.log('\nDry run — no writes. Re-run with --write to register.');
    await closeDb();
    return;
  }

  console.log(`\nWriting ${toRegister.length} sources…`);
  for (const s of toRegister) {
    await upsertSource({ ...s, country: 'AT', works: true });
  }
  console.log(`Wrote ${toRegister.length} sources.`);
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
