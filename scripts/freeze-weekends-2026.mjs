#!/usr/bin/env node
// Freeze George-reviewed Linz/Wien weekend pages through the end of 2026.
// This script never calls an extraction or copywriting provider: it selects
// existing event rows and writes short factual copy from their frozen facts.

import { getChannel, weekendLabel } from '../lib/city-channels.js';
import { weekendEventsByIds } from '../lib/db.js';
import { digestItem, saveDigest } from '../lib/digest.js';
import { isForKids } from '../lib/kid-cats.js';

const PLAN = {
  '2026-08-21': {
    linz: ['7', '14353', '63076', '78026', '23', '76190', '55409'],
    wien: ['74253', '45776', '73781', '73774', '74242', '74237', '22313', '74259'],
  },
  '2026-08-28': {
    linz: ['76185', '54109', '68156', '60062', '76193', '76192', '76196'],
    wien: ['73908', '31724', '79372', '73769', '31914', '79740'],
  },
  '2026-09-04': {
    linz: ['13751', '31905', '46321', '74389', '251', '71891', '2655'],
    wien: ['31725', '76217', '76218', '31915', '11326', '60914'],
  },
  '2026-09-11': {
    linz: ['54121', '75516', '60068', '44930', '79905', '497', '36645', '2660'],
    wien: ['73922', '45798', '45799', '73929', '31729', '31913', '31911', '63872'],
  },
  '2026-09-18': {
    linz: ['1032', '499', '744', '69839', '2663', '12366'],
    wien: ['73946', '45808', '73938', '73942', '45806', '78312', '22358'],
  },
  '2026-09-25': {
    linz: ['31756', '77540', '745', '502', '2666', '1539', '986'],
    wien: ['45814', '45819', '73961', '45817', '73966', '31917', '22373'],
  },
  '2026-10-02': {
    linz: ['39420', '2674', '63059', '14310', '848', '2675'],
    wien: ['73972', '22520', '22521', '22522', '33705', '78363'],
  },
  '2026-10-09': {
    linz: ['13752', '25033', '13763', '79935', '2681', '78877'],
    wien: ['22535', '22536', '22538', '78379', '75144', '7631'],
  },
  '2026-10-16': {
    linz: ['506', '26364', '25327', '504', '32313', '1764', '79839'],
    wien: ['45824', '22554', '22555', '22556', '52422', '52410', '76924'],
  },
  '2026-10-23': {
    linz: ['31759', '25075', '50765', '14391', '1546', '13357'],
    wien: ['78442', '22565', '22567', '8736', '78434', '78439', '78758'],
  },
  '2026-10-30': {
    linz: ['2685', '67869', '6063', '68193', '43404', '32224'],
    wien: ['31761', '32042', '9944', '50879', '52478', '78456', '74022'],
  },
  '2026-11-06': {
    linz: ['25108', '601', '198', '511', '2689', '78909'],
    wien: ['45829', '8817', '22589', '22591', '22593', '7649', '8818'],
  },
  '2026-11-13': {
    linz: ['2693', '514', '74581', '991', '33730', '65198'],
    wien: ['22606', '22607', '22608', '32044', '8274', '7660', '78776', '25236'],
  },
  '2026-11-20': {
    linz: ['519', '26445', '992', '2695', '74559', '993'],
    wien: ['32046', '22617', '22619', '50651', '78803', '8822', '6808'],
  },
  '2026-11-27': {
    linz: ['55323', '67913', '521', '2701', '25158', '206'],
    wien: ['22626', '22627', '37899', '31928', '78514', '50664', '23079'],
  },
  '2026-12-04': {
    linz: ['2708', '1562', '43421', '523', '2707', '1037'],
    wien: ['31765', '31767', '22634', '36320', '8862', '78531', '52666'],
  },
  '2026-12-11': {
    linz: ['2711', '25739', '61373', '76265'],
    wien: ['22655', '22645', '32048', '22648', '10125', '9948', '78549', '7706'],
  },
  '2026-12-18': {
    linz: ['525', '2713', '2714', '64439', '25172'],
    wien: ['22667', '22669', '22670', '52536', '78873', '78552', '25615'],
  },
  '2026-12-25': {
    linz: ['25437', '26646', '25439', '67938'],
    wien: ['22679', '22680', '78806', '39396', '50704'],
  },
};

// The issue being posted now gets fully tailored card copy. Later issues get
// concise original fact copy below and can be refreshed on Wednesday/Thursday
// if a source changes a time or adds a stronger event.
const CURRENT_TEASERS = {
  '7': 'Open-Air-Kino im Innenhof des Priesterseminars: eine sommerliche Filmnacht mitten in Linz.',
  '14353': 'Beim Kinderartikelbasar im Pfarrheim Waizenkirchen können Familien gut erhaltene Kindersachen finden.',
  '63076': 'Ein ganzer Samstag Hobbyfußball für Kinder beim Summer Cup in Haibach im Mühlkreis.',
  '78026': 'Bunte Gesichter am Sonntag: In Wilhering ist vier Stunden lang Kinderschminken angesagt.',
  '23': 'Fünf Bühnen, Pop, Rock und Schlager: Das Linzer Krone-Fest läuft drei Tage bei freiem Eintritt.',
  '76190': 'Punk und Indie-Rock mit deutschen Texten beim Gartenkonzert von Mann aus Marseille im Strandgut.',
  '55409': 'Das Marktfest bringt von Freitag bis Sonntag Feststimmung nach Bad Schallerbach.',
  '74253': 'Das Rote Kreuz lädt am Samstag zum kostenlosen Familienfest auf der Wiener Kaiserwiese.',
  '45776': 'Beim WIENXTRA-Ferienspiel entdecken Kinder und Erwachsene am Sonntag gemeinsam die Welt des Modellbaus.',
  '73781': 'Der Neustifter Kirtag verbindet vier Tage lang Wiener Tradition, Marktstände und Kulinarik.',
  '73774': 'Die Vienna Classic Days bringen von Freitag bis Sonntag klassische Fahrzeuge nach Wien.',
  '74242': 'Freiluftkino am Brunnenmarkt: Am Freitagabend läuft „Narben eines Putsches“ bei freiem Eintritt.',
  '74237': 'Kostenlose Live-Musik am Freitagabend bei den Arbeiter.innen.konzerten in Wien.',
  '22313': 'Eine Führung im Pratermuseum erzählt am Freitag, warum der Wiener Prater ein Ort für alle ist.',
  '74259': 'Andrea Bocelli feiert am Samstagabend in Wien sein 30-jähriges Bühnenjubiläum.',
};

const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function factualTeaser(item) {
  const topic = item.cat === 'music' ? 'Musik'
    : item.cat === 'festival' ? 'Feststimmung'
      : item.cat === 'sport' ? 'Bewegung'
        : item.cat === 'market' ? 'Stöbern'
          : item.cat === 'workshop' ? 'Mitmachen'
            : item.cat === 'family' ? 'Familienzeit'
              : 'Kultur';
  const place = item.venue || item.town;
  const free = item.badges.includes('gratis') ? ' Der Eintritt ist gratis.' : '';
  return `Am Wochenende geht es um ${topic.toLowerCase()}${place ? ` bei ${place}` : ''}. Geplant für ${item.when}.${free}`;
}

const write = process.argv.includes('--write');
let pageCount = 0;
let itemCount = 0;

for (const [friday, cities] of Object.entries(PLAN)) {
  for (const [slug, ids] of Object.entries(cities)) {
    const channel = getChannel(slug);
    const window = { from: friday, to: addDays(friday, 2), friday, sunday: addDays(friday, 2) };
    const pool = await weekendEventsByIds({
      ids,
      lat: channel.lat,
      lng: channel.lng,
      radiusKm: channel.radiusKm,
      from: window.from,
      to: window.to,
    });
    const byId = new Map(pool.map((event) => [String(event.id), event]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) throw new Error(`${slug} ${friday}: missing event ids ${missing.join(', ')}`);

    const items = ids.map((id) => {
      const event = byId.get(id);
      const item = digestItem(event, {
        window,
        channel,
        section: isForKids(event) ? 'family' : 'all',
      });
      return { ...item, teaser: CURRENT_TEASERS[id] || factualTeaser(item) };
    });
    const label = weekendLabel(window, channel.lang);
    const digest = {
      channel,
      window,
      label,
      items,
      droppedIds: [],
      copyModel: null,
      subject: `Wochenende in ${channel.label}: ${label}`,
      intro: `Unsere redaktionelle Auswahl für ${label}: ${items.length} Ideen rund um ${channel.label}, geprüft aus den bereits gesammelten Veranstaltungsdaten.`,
    };

    if (write) await saveDigest(digest);
    console.log(`${write ? 'saved' : 'checked'} ${slug} ${friday}: ${items.length} picks`);
    pageCount++;
    itemCount += items.length;
  }
}

console.log(`${write ? 'saved' : 'validated'} ${pageCount} pages with ${itemCount} picks; external AI calls: 0`);
process.exit(0);
