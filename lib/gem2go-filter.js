// GEM2GO 2026 redesign (first seen on steyr.at): the event list is an ASP.NET
// filter form whose default view starts "today" and shows ~10 events. GET
// params are ignored, so on a busy day page 1 is all today and the crawl never
// sees tomorrow (Steyr had 415 events stored, only today's ever upcoming).
// The form honours a POSTed `fromDate-<id>` though, so we re-submit it with a
// moving start date until the horizon. Facts come from the same GEM2GO list
// parser as page 1; this module only walks the dates.

export const GEM2GO_FORM_ROUNDS = 40;
export const GEM2GO_FORM_HORIZON_DAYS = 60;

// Variant B (Vorarlberg/Tirol/OÖ/Salzburg/Kärnten municipalities, 2026): same
// aspnetForm, but the date input is a plain text field named by a numeric
// control id (`name="6869"`, label/title "Datum ab") holding dd.mm.yyyy. It is
// found by that label, not by name, and posted as dd.mm.yyyy. No submit-button
// field is needed; the hidden fields (__VIEWSTATE, layout flag, ...) suffice.
function labelledDateField(html) {
  const labels = {};
  for (const [, id, text] of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi)) {
    labels[id] = text.replace(/<[^>]*>/g, '').trim();
  }
  const isDatumAb = (t) => /^datum\s+ab$/i.test((t || '').trim());
  for (const [tag] of html.matchAll(/<input\b[^>]*>/gi)) {
    const attr = (n) => new RegExp(`\\b${n}="([^"]*)"`, 'i').exec(tag)?.[1];
    const type = (attr('type') || 'text').toLowerCase();
    const name = attr('name');
    if (!name || (type !== 'text' && type !== 'date')) continue;
    // Variant C (<ul class="veranstaltung_liste"> pages): <input type="date" class="vonDatum" title="Von">.
    const isVon = type === 'date' && /\bvonDatum\b/.test(attr('class') || '');
    if (!isVon && !isDatumAb(labels[attr('id')]) && !isDatumAb(attr('title'))) continue;
    return { name, format: /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(attr('value') || '') ? 'dmy' : 'iso' };
  }
  return null;
}

// crawl.mjs gate: does this page carry a walkable GEM2GO filter form (either variant)?
export function hasGem2goFilterForm(html) {
  return gem2goFilterForm(html, 'https://gem2go.invalid/') !== null;
}

// ISO YYYY-MM-DD → the field's wire format.
function formatDate(ymd, format) {
  return format === 'dmy' ? ymd.split('-').reverse().join('.') : ymd;
}

export function gem2goFilterForm(html, pageUrl) {
  const named = /name="(fromDate-\d+)"/.exec(html)?.[1];
  const labelled = named ? null : labelledDateField(html);
  const dateField = named || labelled?.name;
  const dateFormat = labelled?.format || 'iso';
  const formTag = /<form\b[^>]*\bid="aspnetForm"[^>]*>/i.exec(html)?.[0];
  const action = formTag && /\baction="([^"]+)"/i.exec(formTag)?.[1];
  if (!dateField || !action) return null;
  const hidden = {};
  for (const [tag] of html.matchAll(/<input\b[^>]*\btype="hidden"[^>]*>/gi)) {
    const name = /\bname="([^"]+)"/i.exec(tag)?.[1];
    if (name) hidden[name] = (/\bvalue="([^"]*)"/i.exec(tag)?.[1] || '').replace(/&amp;/g, '&');
  }
  return { url: new URL(action.replace(/&amp;/g, '&'), pageUrl).toString(), dateField, dateFormat, hidden };
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// crawl.mjs's parseGem2goEvents yields `date_start`/`time_start` (starts_at is
// only built later), so read either shape — otherwise the cursor never leaves
// today and the dedupe key collapses same-title events on different days.
const eventDay = (ev) => String(ev.starts_at || ev.date_start || '').slice(0, 10);
const eventKey = (ev) => `${ev.starts_at || `${ev.date_start}T${ev.time_start || ''}`}|${ev.title}`;

// fetchPage(url, body) → html; parse(html) → events. `today` is a Vienna
// YYYY-MM-DD. Re-requests the last day seen (it may continue past a page
// break) and steps a day forward only when a round adds nothing new.
export async function walkGem2goFilter(html, { pageUrl, today, fetchPage, parse, events = [] }) {
  let form = gem2goFilterForm(html, pageUrl);
  if (!form) return events;
  const out = [...events];
  const seen = new Set(out.map(eventKey));
  const horizon = addDays(today, GEM2GO_FORM_HORIZON_DAYS);
  let cursor = out.map(eventDay).filter(Boolean).sort().at(-1) || today;
  if (cursor < today) cursor = today;
  for (let round = 0; round < GEM2GO_FORM_ROUNDS && cursor <= horizon; round++) {
    const body = new URLSearchParams({ ...form.hidden, [form.dateField]: formatDate(cursor, form.dateFormat) });
    let page;
    try { page = await fetchPage(form.url, body); } catch { break; }
    if (!page) break;
    const parsed = parse(page);
    if (!parsed.length) break; // nothing on or after cursor: calendar exhausted
    for (const ev of parsed) if (!seen.has(eventKey(ev))) { seen.add(eventKey(ev)); out.push(ev); }
    const last = parsed.map(eventDay).filter(Boolean).sort().at(-1);
    cursor = last && last > cursor ? last : addDays(cursor, 1);
    form = gem2goFilterForm(page, form.url) || form; // fresh __VIEWSTATE
  }
  return out;
}
