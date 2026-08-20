// One-off: register official Austrian venue calendars discovered by comparing
// Okolo coverage with Somo. Somo is discovery evidence only; every URL below
// is the venue/operator's official calendar and was verified live before being
// added.
//
// Usage: node --env-file=.env.local scripts/register-venue-sources.mjs
//        node --env-file=.env.local scripts/register-venue-sources.mjs --write
import { listSourcesForDedup, upsertSource, closeDb } from '../lib/db.js';
import { robotsAllowed } from '../lib/crawl-net.js';

const SOURCES = [
  {
    name: 'Posthof Linz — Programm',
    url: 'https://www.posthof.at/',
    town: 'Linz', region: 'Oberösterreich',
    notes: 'Official Posthof programme; highest-volume Linz venue gap in the Somo comparison. '
      + 'Rich server-rendered programme, with event JSON-LD on detail pages.',
  },
  {
    name: 'Stadtwerkstatt Linz — Veranstaltungen',
    url: 'https://wp.stwst.at/',
    town: 'Linz', region: 'Oberösterreich',
    notes: 'Official Stadtwerkstatt programme. Server-rendered event list; WordPress RSS is not '
      + 'event-structured, so normal crawl may use LLM fallback.',
  },
  {
    name: 'KAPU Linz — Events',
    url: 'https://www.kapu.or.at/events',
    town: 'Linz', region: 'Oberösterreich',
    notes: 'Official KAPU programme. Stable server-rendered Drupal event list.',
  },
  {
    name: 'Brucknerhaus Linz — Veranstaltungen',
    url: 'https://www.brucknerhaus.at/programm/veranstaltungen',
    town: 'Linz', region: 'Oberösterreich',
    notes: 'Official Brucknerhaus and Brucknerfest programme, including dedicated family and '
      + 'children listings.',
  },
  {
    name: 'Tabakfabrik Linz — Events',
    url: 'https://tabakfabrik-linz.at/events/',
    town: 'Linz', region: 'Oberösterreich',
    notes: 'Official Tabakfabrik calendar with workshops, exhibitions, tours and family events.',
  },
  {
    name: 'Alter Schlachthof Wels — Programm',
    url: 'https://www.schlachthofwels.at/programm/',
    town: 'Wels', region: 'Oberösterreich',
    notes: 'Official Alter Schlachthof Wels cultural programme.',
  },

  {
    name: 'Wiener Stadthalle — Alle Events',
    url: 'https://www.stadthalle.com/de/events/alle-events',
    town: 'Wien', region: 'Wien',
    notes: 'Official Wiener Stadthalle calendar; high-volume Somo venue gap.',
  },
  {
    name: 'Arena Wien — Programm',
    url: 'https://arena.wien/',
    town: 'Wien', region: 'Wien',
    notes: 'Official Arena Wien programme with current and upcoming events.',
  },
  {
    name: 'Flex Wien — Programm',
    url: 'https://flex.at/',
    town: 'Wien', region: 'Wien',
    notes: 'Official Flex calendar. Page publishes Event JSON-LD and iCal links.',
  },
  {
    name: 'The Comedy Pub Wien — Events',
    url: 'https://www.thecomedypub.at/events/',
    town: 'Wien', region: 'Wien',
    notes: 'Official Comedy Pub programme; repeated Somo venue with ten current cards at audit time.',
  },
  {
    name: 'WUK Wien — Programm',
    url: 'https://www.wuk.at/programm/',
    town: 'Wien', region: 'Wien',
    notes: 'Official WUK programme covering music, performing arts and children culture.',
  },

  {
    name: 'Rockhouse Salzburg — Programm',
    url: 'https://www.rockhouse.at/de/events',
    town: 'Salzburg', region: 'Salzburg',
    notes: 'Official Rockhouse programme; largest repeated Salzburg venue in the Somo comparison.',
  },
  {
    name: 'Salzburgarena — Events & Tickets',
    url: 'https://www.salzburgarena.at/de/events-tickets/',
    cms: 'salzburgarena',
    town: 'Salzburg', region: 'Salzburg',
    notes: 'Official Salzburgarena calendar with stable dated listings.',
  },
  {
    name: 'Stiftung Mozarteum — Concerts',
    url: 'https://mozarteum.at/en/concerts',
    town: 'Salzburg', region: 'Salzburg',
    notes: 'Official Stiftung Mozarteum calendar, including family programming.',
  },
  {
    name: 'SZENE Salzburg — Programm',
    url: 'https://szene-salzburg.net/programm/',
    town: 'Salzburg', region: 'Salzburg',
    notes: 'Official SZENE Salzburg programme.',
  },

  {
    name: 'Explosiv Graz — iCal',
    url: 'https://www.explosiv.at/events/?ical=1',
    town: 'Graz', region: 'Steiermark',
    notes: 'Official Explosiv calendar feed. Direct text/calendar endpoint; deterministic iCal route.',
  },
  {
    name: 'p.p.c. Graz — Programm',
    url: 'https://popculture.at/',
    town: 'Graz', region: 'Steiermark',
    notes: 'Official p.p.c. Graz programme. Page publishes Event JSON-LD and iCal links.',
  },
  {
    name: 'Grazer Spielstätten — Programm',
    url: 'https://spielstaetten.buehnen-graz.com/',
    cms: 'grazer-spielstaetten',
    town: 'Graz', region: 'Steiermark',
    notes: 'Official programme for Orpheum, Dom im Berg and Schloßbergbühne Kasematten.',
  },
  {
    name: 'Messe Congress Graz — Events',
    url: 'https://www.mcg.at/',
    town: 'Graz', region: 'Steiermark',
    notes: 'Official combined calendar for Congress Graz, Stadthalle Graz and Messe Graz.',
  },

  {
    name: 'Music Hall Innsbruck — Veranstaltungen',
    url: 'https://www.music-hall.at/veranstaltungen/aktuelleveranstaltungen.html',
    town: 'Innsbruck', region: 'Tirol',
    notes: 'Official Music Hall programme. Server-rendered Joomla/DPCalendar listing.',
  },
  {
    name: 'p.m.k Innsbruck — Programm',
    url: 'https://pmk.or.at/de/about/home',
    town: 'Innsbruck', region: 'Tirol',
    notes: 'Official p.m.k programme with server-rendered upcoming listings.',
  },
  {
    name: 'Congress Messe Innsbruck — Veranstaltungskalender',
    url: 'https://www.cmi.at/de/veranstaltungskalender',
    town: 'Innsbruck', region: 'Tirol',
    notes: 'Official combined calendar for Congress Innsbruck, Messe Innsbruck and congresspark igls.',
  },

  {
    name: 'Bregenzer Festspiele — Spielplan',
    url: 'https://bregenzerfestspiele.com/de/karten-besuch/spielplan?genre=119&location=alle',
    cms: 'bregenzer-festspiele',
    town: 'Bregenz', region: 'Vorarlberg',
    notes: 'Official Bregenzer Festspiele schedule, including Seebühne and Festspielhaus events.',
  },
  {
    name: 'Messe Wieselburg — Veranstaltungskalender',
    url: 'https://www.messewieselburg.at/veranstaltungskalender/',
    town: 'Wieselburg', region: 'Niederösterreich',
    notes: 'Official Messe Wieselburg calendar with public events at the exhibition grounds.',
  },
];

async function main() {
  const write = process.argv.includes('--write');
  const existing = await listSourcesForDedup();
  const existingUrls = new Set(existing.map((source) => source.url));
  const checked = [];

  for (const source of SOURCES) {
    if (existingUrls.has(source.url)) {
      checked.push({ source, status: 'registered' });
      continue;
    }
    const robots = await robotsAllowed(source.url);
    checked.push({ source, status: robots ? 'ready' : 'robots-blocked' });
  }

  for (const { source, status } of checked) {
    console.log(`  [${status}] ${source.name} — ${source.url}`);
  }

  const ready = checked.filter(({ status }) => status === 'ready').map(({ source }) => source);
  const blocked = checked.filter(({ status }) => status.endsWith('blocked')).length;
  console.log(`\n${SOURCES.length} official venue calendars: ${ready.length} ready, ${blocked} blocked, ${SOURCES.length - ready.length - blocked} already registered.`);

  if (!write) {
    console.log('Dry run — no writes. Re-run with --write to register ready sources.');
    await closeDb();
    return;
  }

  for (const source of ready) {
    await upsertSource({
      ...source,
      kind: 'venue',
      cms: null,
      country: 'AT',
      works: true,
    });
  }
  let updatedRoutes = 0;
  for (const { source, status } of checked) {
    if (status === 'registered' && source.cms) {
      await upsertSource({ ...source, kind: 'venue', country: 'AT', works: true });
      updatedRoutes++;
    }
  }
  console.log(`Registered ${ready.length} venue sources.`);
  if (updatedRoutes) console.log(`Updated ${updatedRoutes} registered adapter route(s).`);
  await closeDb();
}

main().catch((error) => { console.error(error); process.exit(1); });
