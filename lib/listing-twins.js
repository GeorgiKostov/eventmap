// GEM2GO sites share one event database: a neighbour's event re-listed on a
// "Kiosk" page keeps its object id in the URL (`detailonr=226114487-274`) on
// every host. Same object id + same start + same title is one event, however
// many municipal sites list it. Before 2026-11-14 each listing was its own row
// (a blood drive in Obertrum showed in six towns). Address towns fix most of
// these (lib/address-town.js); this collapses the rest, where the address was
// too vague to geocode. Used by scripts/crawl.mjs and scripts/migrate-listing-twins.mjs.
import { addressTown, sameTown } from './address-town.js';

export function gem2goObjectId(url) {
  return String(url || '').match(/[?&]detailonr=(\d+-\d+)(?:$|[&#])/)?.[1] || null;
}

const titleKey = (title) => String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function sameListingTitle(a, b) {
  return titleKey(a) === titleKey(b);
}

const PRECISION = { venue: 3, address: 2, town: 1 };
// The row worth keeping: listed by the town its address names (the publisher's
// own copy), then the most precise pin, then the oldest row.
export function pickKeeper(rows) {
  const rank = (r) => [
    sameTown(addressTown(r.address), r.town) ? 1 : 0,
    PRECISION[r.geo_precision] || 0,
  ];
  return [...rows].sort((a, b) => {
    const [ha, pa] = rank(a);
    const [hb, pb] = rank(b);
    if (ha !== hb) return hb - ha;
    if (pa !== pb) return pb - pa;
    return BigInt(a.id) < BigInt(b.id) ? -1 : 1;
  })[0];
}
