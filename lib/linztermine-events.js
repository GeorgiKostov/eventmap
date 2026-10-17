// The visible occurrence list is authoritative: JSON-LD spans several years.
import { decodeEntities, stripTags } from './entities.js';
import { politeFetch, robotsAllowed } from './crawl-net.js';

export function parseLinztermineDetail(html, sourceUrl, occurrenceHtml = null) {
  const text = (value) => stripTags(decodeEntities(value || '')).replace(/\s+/g, ' ').trim();
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  let location = null;
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const value = JSON.parse(match[1]);
      if (value['@type'] === 'Event') location = value.location;
    } catch { /* location remains unknown */ }
  }
  if (!title || /^abgesagt(?:\s|:|[–—-])/i.test(title)) return [];
  const main = html.slice(html.indexOf('<h1')).split('id="more"')[0];
  const dates = occurrenceHtml ?? html.split('id="event-dates-list"')[1]?.split('</section>')[0] ?? '';
  const categories = /markt/i.test(title) ? ['market'] : [];
  if (/href="\/suche\?children=true"/.test(main)) categories.push('family');
  const street = location?.address?.streetAddress?.trim();
  // The visible map caption names the whole venue; JSON-LD may only name a room.
  const mapCaption = html.split('id="mapoverlay"')[1]?.split('</div>')[0] || '';
  const venue = text(mapCaption.match(/<p\b[^>]*>([\s\S]*?)<br\b[^>]*>/i)?.[1]) || location?.name || null;
  const events = [];
  const rows = [...dates.matchAll(/<li\b[^>]*class="list-group-item"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  if (!dates) {
    const header = main.split('</p>')[0];
    if (/Datum:<\/strong><\/span>\d{2}\.\d{2}\.\d{4}\s*\//.test(header)) rows.push(header);
  }
  for (const row of rows) {
    const value = text(row);
    const date = value.match(/Datum:\s*(?:\w+\.,\s*)?(\d{2})\.(\d{2})\.(\d{4})/);
    if (!date) continue;
    const time = value.match(/(?:Uhrzeit:|\/)\s*((?:[01]\d|2[0-3]):[0-5]\d)(?:\s*bis\s*((?:[01]\d|2[0-3]):[0-5]\d))?/);
    events.push({
      title, date_start: `${date[3]}-${date[2]}-${date[1]}`,
      time_start: time?.[1] || null, date_end: null, time_end: time?.[2] || null,
      venue, address: street && street !== '__' ? street : null,
      town: location?.address?.addressLocality || 'Linz', categories, is_free: /href="\/suche\?free=true"/.test(main) ? true : null,
      age_min: null, age_max: null, indoor: null, description: null, source_url: sourceUrl,
    });
  }
  return events;
}

// Follow the site's visible read-only "more dates" control with its own form state.
export async function linztermineOccurrenceHtml(html, url, fetchImpl, robotsFn) {
  let section = html.split('id="event-dates-list"')[1]?.split('</section>')[0] || '';
  let state = section.match(/name="jakarta.faces.ViewState"[^>]*value="([^"]+)"/)?.[1];
  for (let page = 0; page < 40 && /Mehr Termine anzeigen/.test(section); page++) {
    const form = section.match(/<form id="([^"]+)"[^>]*action="([^"]+)"/);
    const control = section.match(/<a id="([^"]+)"[^>]*>Mehr Termine anzeigen/);
    if (!form || !control || !state) throw new Error('Linztermine date pagination markup changed');
    const action = new URL(decodeEntities(form[2]), url).toString();
    if (!(await robotsFn(action))) throw new Error('Linztermine date pagination disallowed by robots');
    const body = new URLSearchParams({
      'jakarta.faces.partial.ajax': 'true', 'jakarta.faces.source': control[1],
      'jakarta.faces.partial.execute': control[1], 'jakarta.faces.partial.render': form[1],
      [form[1]]: form[1], [control[1]]: control[1], 'jakarta.faces.ViewState': state,
    });
    const response = await fetchImpl(action, { method: 'POST', body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Faces-Request': 'partial/ajax' },
    });
    if (!response.ok) throw new Error(`Linztermine date pagination HTTP ${response.status}`);
    const xml = await response.text();
    const updates = [...xml.matchAll(/<update id="([^"]+)"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/g)];
    const next = updates.find((m) => m[1] === form[1])?.[2];
    if (!next || (next.match(/class="list-group-item"/g) || []).length <= (section.match(/class="list-group-item"/g) || []).length) throw new Error('Linztermine date pagination made no progress');
    section = next;
    state = updates.find((m) => m[1].includes('jakarta.faces.ViewState'))?.[2] || state;
  }
  if (/Mehr Termine anzeigen/.test(section)) throw new Error('Linztermine date pagination limit reached');
  return section;
}

export async function fetchLinztermineEvents(html, src, {
  fetchImpl = politeFetch, robotsFn = robotsAllowed,
} = {}) {
  const links = [...new Set([...html.matchAll(/href="(\/event\/\d+)"/g)]
    .map((match) => new URL(match[1], src.url).toString()))];
  const events = [];
  for (const url of links) {
    if (!(await robotsFn(url))) continue;
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Linztermine detail HTTP ${response.status}: ${url}`);
    const detail = await response.text();
    const dates = await linztermineOccurrenceHtml(detail, url, fetchImpl, robotsFn);
    events.push(...parseLinztermineDetail(detail, url, dates));
  }
  if (links.length && !events.length) throw new Error('Linztermine detail pages yielded no dated occurrences');
  return events;
}
